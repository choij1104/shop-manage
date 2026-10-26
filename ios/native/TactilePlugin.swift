import UIKit
import Capacitor

/// Taptic Engine feedback for Chairbook: a light tap when a booking is saved, a firm "success"
/// when a payment is recorded, a selection tick when the dock or a chip changes.
///
/// JS name "Tactile":
///   impact({ style: "light" | "medium" | "heavy" | "soft" | "rigid" })
///   selection()
///   notify({ type: "success" | "warning" | "error" })
@objc(TactilePlugin)
public class TactilePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TactilePlugin"
    public let jsName = "Tactile"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "impact", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "selection", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "notify", returnType: CAPPluginReturnPromise)
    ]

    private lazy var picker = UISelectionFeedbackGenerator()
    private lazy var notifier = UINotificationFeedbackGenerator()

    @objc func impact(_ call: CAPPluginCall) {
        let style: UIImpactFeedbackGenerator.FeedbackStyle
        switch call.getString("style") ?? "light" {
        case "medium": style = .medium
        case "heavy": style = .heavy
        case "soft": style = .soft
        case "rigid": style = .rigid
        default: style = .light
        }
        DispatchQueue.main.async {
            UIImpactFeedbackGenerator(style: style).impactOccurred()
            call.resolve()
        }
    }

    @objc func selection(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.picker.selectionChanged()
            call.resolve()
        }
    }

    @objc func notify(_ call: CAPPluginCall) {
        let kind: UINotificationFeedbackGenerator.FeedbackType
        switch call.getString("type") ?? "success" {
        case "warning": kind = .warning
        case "error": kind = .error
        default: kind = .success
        }
        DispatchQueue.main.async {
            self.notifier.notificationOccurred(kind)
            call.resolve()
        }
    }
}
