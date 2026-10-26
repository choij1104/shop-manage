import Foundation
import Capacitor
import EventKit
import EventKitUI

/// "Add to Calendar" for a Chairbook booking. Opens Apple's own event editor, pre-filled with the
/// client, service, time and length, so the stylist confirms and picks the calendar.
///
/// iOS 17 and later: the editor runs outside the app and needs no calendar permission at all.
/// iOS 15 and 16: the editor needs calendar access, which is asked for the first time it is used.
///
/// JS name "CalendarHandoff":
///   access()                                     -> { status: "granted" | "denied" | "notDetermined" | "notNeeded" }
///   add({ title, start, minutes, notes, alertMinutes }) -> { result: "saved" | "canceled" | "deleted" }
///        start = Unix time in milliseconds
@objc(CalendarHandoffPlugin)
public class CalendarHandoffPlugin: CAPPlugin, CAPBridgedPlugin, EKEventEditViewDelegate {
    public let identifier = "CalendarHandoffPlugin"
    public let jsName = "CalendarHandoff"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "access", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "add", returnType: CAPPluginReturnPromise)
    ]

    private let store = EKEventStore()
    private var openCall: CAPPluginCall?

    @objc func access(_ call: CAPPluginCall) {
        if #available(iOS 17.0, *) {
            call.resolve(["status": "notNeeded"])
            return
        }
        switch EKEventStore.authorizationStatus(for: .event) {
        case .notDetermined: call.resolve(["status": "notDetermined"])
        case .denied, .restricted: call.resolve(["status": "denied"])
        default: call.resolve(["status": "granted"])
        }
    }

    @objc func add(_ call: CAPPluginCall) {
        guard let title = call.getString("title"), let startMs = call.getDouble("start") else {
            call.reject("title and start are required")
            return
        }
        let minutes = max(5, min(call.getInt("minutes") ?? 60, 12 * 60))
        let start = Date(timeIntervalSince1970: startMs / 1000)
        let notes = call.getString("notes")
        let alertMinutes = call.getInt("alertMinutes")

        let present = {
            DispatchQueue.main.async {
                let event = EKEvent(eventStore: self.store)
                event.title = title
                event.startDate = start
                event.endDate = start.addingTimeInterval(TimeInterval(minutes * 60))
                event.notes = notes
                if let m = alertMinutes, m > 0 { event.addAlarm(EKAlarm(relativeOffset: TimeInterval(-m * 60))) }
                let editor = EKEventEditViewController()
                editor.eventStore = self.store
                editor.event = event
                editor.editViewDelegate = self
                self.openCall = call
                guard let host = self.bridge?.viewController else {
                    self.openCall = nil
                    call.reject("No window to present the calendar editor")
                    return
                }
                host.present(editor, animated: true)
            }
        }

        if #available(iOS 17.0, *) {
            present()
            return
        }
        switch EKEventStore.authorizationStatus(for: .event) {
        case .denied, .restricted:
            call.reject("Calendar access is off for Chairbook. Turn it on in Settings > Chairbook.", "denied")
        case .notDetermined:
            store.requestAccess(to: .event) { granted, _ in
                if granted { present() } else { call.reject("Calendar access was not allowed.", "denied") }
            }
        default:
            present()
        }
    }

    public func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) {
        let result: String
        switch action {
        case .saved: result = "saved"
        case .deleted: result = "deleted"
        default: result = "canceled"
        }
        controller.dismiss(animated: true) {
            self.openCall?.resolve(["result": result])
            self.openCall = nil
        }
    }
}
