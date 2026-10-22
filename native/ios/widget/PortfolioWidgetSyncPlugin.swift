import Foundation
import Capacitor
import WidgetKit

// This plugin is compiled into the containing App, NOT the widget extension.
// It is the only writer to the App Group. Nothing is uploaded to a server.
@objc(PortfolioWidgetSyncPlugin)
public class PortfolioWidgetSyncPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PortfolioWidgetSyncPlugin"
    public let jsName = "PortfolioWidgetSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSnapshot", returnType: CAPPluginReturnPromise)
    ]

    private let group = "group.com.sy1124.portfoliopilot"
    private let enabledKey = "portfolio-widget-enabled-v1"
    private let snapshotKey = "portfolio-widget-snapshot-v1"

    private struct WatchItem: Decodable {
        let symbol: String
        let name: String
        let close: Double
        let changePct: Double?
        let date: String
    }

    private struct Snapshot: Decodable {
        let version: Int
        let enabled: Bool
        let isDemo: Bool
        let generatedAt: String
        let totalTwd: Double
        let gainPct: Double?
        let quoteDate: String?
        let watchlist: [WatchItem]
    }

    private func sharedDefaults(_ call: CAPPluginCall) -> UserDefaults? {
        // A suite name alone doesn't prove that the entitlement was provisioned.
        guard FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) != nil,
              let defaults = UserDefaults(suiteName: group) else {
            call.reject("App Groups 尚未完成簽署或設定；沒有讀取／寫入小工具資料。")
            return nil
        }
        return defaults
    }

    private func refresh() {
        WidgetCenter.shared.reloadTimelines(ofKind: "PortfolioPilotPortfolioOverview")
        WidgetCenter.shared.reloadTimelines(ofKind: "PortfolioPilotWatchlist")
    }

    @objc public func status(_ call: CAPPluginCall) {
        guard let defaults = sharedDefaults(call) else { return }
        call.resolve(["enabled": defaults.bool(forKey: enabledKey)])
    }

    @objc public func enable(_ call: CAPPluginCall) {
        guard let defaults = sharedDefaults(call) else { return }
        // Every newly granted consent starts empty; old snapshots can never
        // appear merely because consent was toggled back on.
        defaults.removeObject(forKey: snapshotKey)
        defaults.set(true, forKey: enabledKey)
        refresh()
        call.resolve(["enabled": true])
    }

    @objc public func disable(_ call: CAPPluginCall) {
        guard let defaults = sharedDefaults(call) else { return }
        // Revoke first; even a racing sync() is gated on the native flag.
        defaults.set(false, forKey: enabledKey)
        defaults.removeObject(forKey: snapshotKey)
        refresh()
        call.resolve(["enabled": false])
    }

    @objc public func clearSnapshot(_ call: CAPPluginCall) {
        guard let defaults = sharedDefaults(call) else { return }
        defaults.removeObject(forKey: snapshotKey)
        refresh()
        call.resolve()
    }

    private func validDate(_ value: String) -> Bool {
        guard value.count == 10 else { return false }
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        return formatter.date(from: value) != nil
    }

    @objc public func sync(_ call: CAPPluginCall) {
        guard let defaults = sharedDefaults(call) else { return }
        guard defaults.bool(forKey: enabledKey) else {
            call.reject("尚未允許小工具讀取投資摘要；拒絕寫入。")
            return
        }
        guard let raw = call.getString("snapshotJson"),
              raw.utf8.count <= 12_000,
              let data = raw.data(using: .utf8),
              let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data),
              snapshot.version == 1, snapshot.enabled, !snapshot.isDemo,
              snapshot.totalTwd.isFinite, snapshot.totalTwd >= 0,
              snapshot.gainPct == nil || snapshot.gainPct!.isFinite,
              ISO8601DateFormatter().date(from: snapshot.generatedAt) != nil,
              snapshot.quoteDate == nil || validDate(snapshot.quoteDate!),
              snapshot.watchlist.count <= 3,
              snapshot.watchlist.allSatisfy({
                  !$0.symbol.isEmpty && $0.symbol.count <= 12 &&
                  !$0.name.isEmpty && $0.name.count <= 60 &&
                  $0.symbol.unicodeScalars.allSatisfy({ CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789").contains($0) }) &&
                  $0.close.isFinite && $0.close > 0 &&
                  ($0.changePct == nil || $0.changePct!.isFinite) &&
                  validDate($0.date)
              }) else {
            call.reject("小工具資料格式或數值無效；沒有寫入共享資料。")
            return
        }

        // Reject updates that originated before the last accepted snapshot.
        // Avoid overwriting new holdings with a late network response.
        if let older = defaults.string(forKey: snapshotKey),
           let previousData = older.data(using: .utf8),
           let previous = try? JSONDecoder().decode(Snapshot.self, from: previousData),
           snapshot.generatedAt < previous.generatedAt {
            call.resolve(["updated": false])
            return
        }
        defaults.set(raw, forKey: snapshotKey)
        refresh()
        call.resolve(["updated": true])
    }
}
