import UIKit
import Capacitor

/// Chairbook's root view controller (set in Main.storyboard by scripts/native-setup.py).
/// Hands Chairbook's own Swift plugins to the Capacitor bridge once it is ready.
final class ChairbookBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        let plugins: [CAPPlugin] = [
            BookingAlertsPlugin(),
            CalendarHandoffPlugin(),
            LaunchRoutePlugin(),
            TactilePlugin()
        ]
        plugins.forEach { bridge?.registerPluginInstance($0) }
    }
}
