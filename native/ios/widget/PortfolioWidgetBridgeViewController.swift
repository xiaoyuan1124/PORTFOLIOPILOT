import Capacitor

// Capacitor 8 custom native plugin registration. The generated SceneDelegate
// creates this controller instead of CAPBridgeViewController on scene startup.
class PortfolioWidgetBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(PortfolioWidgetSyncPlugin())
    }
}
