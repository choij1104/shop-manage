import Foundation
import Capacitor
import UserNotifications

/// Local, on-device notifications for Chairbook: a heads-up before each booking and a
/// "time to rebook" nudge for clients after a visit. Nothing leaves the phone; there is no push.
///
/// The web layer owns the schedule. Every time the appointment book changes it sends the whole
/// list of upcoming alerts with replaceAll(), and this plugin swaps Chairbook's pending requests
/// for the new set (iOS keeps at most 64 pending requests per app; the soonest 60 are kept).
///
/// JS name "BookingAlerts":
///   status()                   -> { status: "granted" | "denied" | "notDetermined" }
///   authorize()                -> { status }
///   replaceAll({ items: [ { id, at, title, body, kind, ref } ] }) -> { scheduled }
///        at = Unix time in milliseconds; kind = "booking" | "followup"; ref = booking or client id
///   pending()                  -> { count, next }    next = ms of the soonest alert, or 0
/// Event "opened" { kind, ref, action } when the user taps an alert or one of its buttons.
@objc(BookingAlertsPlugin)
public class BookingAlertsPlugin: CAPPlugin, CAPBridgedPlugin, NotificationHandlerProtocol {
    public let identifier = "BookingAlertsPlugin"
    public let jsName = "BookingAlerts"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "replaceAll", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pending", returnType: CAPPluginReturnPromise)
    ]

    private static let prefix = "chairbook.alert."
    private static let bookingCategory = "CHAIRBOOK_BOOKING"
    private static let followupCategory = "CHAIRBOOK_FOLLOWUP"
    private static let maxPending = 60

    private var center: UNUserNotificationCenter { UNUserNotificationCenter.current() }

    public override func load() {
        // Capacitor's notification router is the notification-center delegate; take its local slot.
        bridge?.notificationRouter.localNotificationHandler = self

        let openBooking = UNNotificationAction(identifier: "OPEN_BOOKING", title: "Open booking", options: [.foreground])
        let bookVisit = UNNotificationAction(identifier: "BOOK_VISIT", title: "Book next visit", options: [.foreground])
        let later = UNNotificationAction(identifier: "DISMISS", title: "Not now", options: [])
        center.setNotificationCategories([
            UNNotificationCategory(identifier: Self.bookingCategory, actions: [openBooking], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: Self.followupCategory, actions: [bookVisit, later], intentIdentifiers: [], options: [])
        ])
    }

    // MARK: NotificationHandlerProtocol

    public func willPresent(notification: UNNotification) -> UNNotificationPresentationOptions {
        // While Chairbook is open, still show the banner so a stylist mid-service sees it.
        return [.banner, .list, .sound]
    }

    public func didReceive(response: UNNotificationResponse) {
        let info = response.notification.request.content.userInfo
        let kind = info["kind"] as? String ?? ""
        let ref = info["ref"] as? String ?? ""
        let action: String
        switch response.actionIdentifier {
        case "BOOK_VISIT": action = "book"
        case "DISMISS": return
        default: action = "open"
        }
        notifyListeners("opened", data: ["kind": kind, "ref": ref, "action": action], retainUntilConsumed: true)
    }

    // MARK: Methods

    private func label(_ s: UNAuthorizationStatus) -> String {
        switch s {
        case .notDetermined: return "notDetermined"
        case .denied: return "denied"
        default: return "granted"     // authorized, provisional, ephemeral
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        center.getNotificationSettings { settings in
            call.resolve(["status": self.label(settings.authorizationStatus)])
        }
    }

    @objc func authorize(_ call: CAPPluginCall) {
        center.requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in
            self.center.getNotificationSettings { settings in
                call.resolve(["status": self.label(settings.authorizationStatus)])
            }
        }
    }

    @objc func replaceAll(_ call: CAPPluginCall) {
        let raw = call.getArray("items") ?? []
        let now = Date()
        var requests: [(Date, UNNotificationRequest)] = []
        for case let item as JSObject in raw {
            guard let id = item["id"] as? String,
                  let ms = (item["at"] as? NSNumber)?.doubleValue, ms > 0 else { continue }
            let fire = Date(timeIntervalSince1970: ms / 1000)
            guard fire > now.addingTimeInterval(5) else { continue }
            let kind = item["kind"] as? String ?? "booking"
            let content = UNMutableNotificationContent()
            content.title = item["title"] as? String ?? "Chairbook"
            content.body = item["body"] as? String ?? ""
            content.sound = .default
            content.categoryIdentifier = kind == "followup" ? Self.followupCategory : Self.bookingCategory
            content.threadIdentifier = kind == "followup" ? "chairbook.followups" : "chairbook.bookings"
            content.userInfo = ["kind": kind, "ref": item["ref"] as? String ?? ""]
            let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: fire)
            let trigger = UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
            requests.append((fire, UNNotificationRequest(identifier: Self.prefix + id, content: content, trigger: trigger)))
        }
        requests.sort { $0.0 < $1.0 }
        let keep = requests.prefix(Self.maxPending).map { $0.1 }

        center.getPendingNotificationRequests { pending in
            let ours = pending.map { $0.identifier }.filter { $0.hasPrefix(Self.prefix) }
            self.center.removePendingNotificationRequests(withIdentifiers: ours)
            let group = DispatchGroup()
            var added = 0
            let lock = NSLock()
            for request in keep {
                group.enter()
                self.center.add(request) { error in
                    if error == nil { lock.lock(); added += 1; lock.unlock() }
                    group.leave()
                }
            }
            group.notify(queue: .main) { call.resolve(["scheduled": added]) }
        }
    }

    @objc func pending(_ call: CAPPluginCall) {
        center.getPendingNotificationRequests { pending in
            let ours = pending.filter { $0.identifier.hasPrefix(Self.prefix) }
            let next = ours.compactMap { ($0.trigger as? UNCalendarNotificationTrigger)?.nextTriggerDate() }.min()
            call.resolve(["count": ours.count, "next": next.map { $0.timeIntervalSince1970 * 1000 } ?? 0])
        }
    }
}
