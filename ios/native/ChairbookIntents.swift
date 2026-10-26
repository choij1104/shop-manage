import Foundation
import Capacitor
#if canImport(AppIntents)
import AppIntents
#endif

/// Siri, Spotlight and Shortcuts for Chairbook.
///   "Show today's bookings in Chairbook"  -> opens the day rail
///   "Log a payment in Chairbook"          -> opens checkout for the client in the chair now
///   "Book an appointment in Chairbook"    -> opens a new booking
/// App Intents need iOS 16; the suggested App Shortcuts (with short titles and symbols) iOS 17.
///
/// An intent runs in the app process, before or after the web view is ready, so the requested
/// screen is parked in LaunchRouteStore and handed to the web layer by LaunchRoutePlugin:
///   consume() -> { route: "today" | "payment" | "book" | "" }
///   event "route" { route } while the app is running.
final class LaunchRouteStore {
    static let shared = LaunchRouteStore()
    static let didChange = Notification.Name("ChairbookLaunchRouteDidChange")
    private let key = "chairbook.launchRoute"
    private let lock = NSLock()

    func park(_ route: String) {
        lock.lock()
        UserDefaults.standard.set(route, forKey: key)
        lock.unlock()
        NotificationCenter.default.post(name: Self.didChange, object: nil)
    }

    func consume() -> String {
        lock.lock()
        defer { lock.unlock() }
        let route = UserDefaults.standard.string(forKey: key) ?? ""
        UserDefaults.standard.removeObject(forKey: key)
        return route
    }
}

@objc(LaunchRoutePlugin)
public class LaunchRoutePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LaunchRoutePlugin"
    public let jsName = "LaunchRoute"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "consume", returnType: CAPPluginReturnPromise)
    ]
    private var observer: NSObjectProtocol?

    public override func load() {
        observer = NotificationCenter.default.addObserver(forName: LaunchRouteStore.didChange, object: nil, queue: .main) { [weak self] _ in
            guard let self = self else { return }
            let route = LaunchRouteStore.shared.consume()
            if !route.isEmpty { self.notifyListeners("route", data: ["route": route], retainUntilConsumed: true) }
        }
    }

    deinit {
        if let observer = observer { NotificationCenter.default.removeObserver(observer) }
    }

    @objc func consume(_ call: CAPPluginCall) {
        call.resolve(["route": LaunchRouteStore.shared.consume()])
    }
}

#if canImport(AppIntents)
@available(iOS 16.0, *)
struct ShowTodaysBookingsIntent: AppIntent {
    static var title: LocalizedStringResource = "Show Today's Bookings"
    static var description = IntentDescription("Opens Chairbook on today's schedule: who is next, open gaps, and today's take.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        LaunchRouteStore.shared.park("today")
        return .result()
    }
}

@available(iOS 16.0, *)
struct LogPaymentIntent: AppIntent {
    static var title: LocalizedStringResource = "Log a Payment"
    static var description = IntentDescription("Opens Chairbook's checkout for the client in your chair now, with tip and payment method.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        LaunchRouteStore.shared.park("payment")
        return .result()
    }
}

@available(iOS 16.0, *)
struct BookAppointmentIntent: AppIntent {
    static var title: LocalizedStringResource = "Book an Appointment"
    static var description = IntentDescription("Opens a new booking in Chairbook.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        LaunchRouteStore.shared.park("book")
        return .result()
    }
}

@available(iOS 17.0, *)
struct ChairbookAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: ShowTodaysBookingsIntent(),
                    phrases: ["Show today's bookings in \(.applicationName)",
                              "Who is next in \(.applicationName)",
                              "Open my day in \(.applicationName)"],
                    shortTitle: "Today's Bookings",
                    systemImageName: "calendar.day.timeline.left")
        AppShortcut(intent: LogPaymentIntent(),
                    phrases: ["Log a payment in \(.applicationName)",
                              "Check out my client in \(.applicationName)"],
                    shortTitle: "Log a Payment",
                    systemImageName: "dollarsign.circle")
        AppShortcut(intent: BookAppointmentIntent(),
                    phrases: ["Book an appointment in \(.applicationName)",
                              "New booking in \(.applicationName)"],
                    shortTitle: "New Booking",
                    systemImageName: "plus.circle")
    }
}
#endif
