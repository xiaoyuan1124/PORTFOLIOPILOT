import Foundation
import SwiftUI
import WidgetKit

// Contract v1 is intentionally read-only. The containing App must explicitly
// opt in before it publishes any personal portfolio data to this App Group.
// The widget never reads WebView localStorage or invents market prices.
private enum SharedSnapshot {
    static let appGroup = "group.com.sy1124.portfoliopilot"
    static let key = "portfolio-widget-snapshot-v1"
    static let consentKey = "portfolio-widget-enabled-v1"

    struct WatchItem: Codable, Identifiable {
        let symbol: String
        let name: String
        let close: Double
        let changePct: Double?
        let date: String
        var id: String { symbol }
    }

    struct Snapshot: Codable {
        let version: Int
        let enabled: Bool
        let isDemo: Bool
        let generatedAt: String
        let totalTwd: Double
        let gainPct: Double?
        let quoteDate: String?
        let watchlist: [WatchItem]
    }

    static func load() -> Snapshot? {
        guard
            let defaults = UserDefaults(suiteName: appGroup),
            defaults.bool(forKey: consentKey),
            let value = defaults.string(forKey: key),
            let bytes = value.data(using: .utf8),
            let snapshot = try? JSONDecoder().decode(Snapshot.self, from: bytes),
            snapshot.version == 1,
            snapshot.enabled,
            !snapshot.isDemo,
            snapshot.totalTwd.isFinite,
            snapshot.totalTwd >= 0,
            snapshot.gainPct == nil || snapshot.gainPct!.isFinite,
            snapshot.watchlist.count <= 3,
            snapshot.watchlist.allSatisfy({ $0.close.isFinite && $0.close > 0 &&
                ($0.changePct == nil || $0.changePct!.isFinite) })
        else {
            return nil
        }
        return snapshot
    }
}

private struct PortfolioEntry: TimelineEntry {
    let date: Date
    let snapshot: SharedSnapshot.Snapshot?
}

private struct PortfolioProvider: TimelineProvider {
    func placeholder(in context: Context) -> PortfolioEntry {
        PortfolioEntry(date: .now, snapshot: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (PortfolioEntry) -> Void) {
        completion(PortfolioEntry(date: .now, snapshot: SharedSnapshot.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PortfolioEntry>) -> Void) {
        let entry = PortfolioEntry(date: .now, snapshot: SharedSnapshot.load())
        // This is a local snapshot, not a real-time quote subscription.
        // WidgetKit retains control over the actual refresh schedule.
        completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(60 * 60))))
    }
}

private enum WidgetPalette {
    static let background = Color(red: 0.10, green: 0.17, blue: 0.14)
    static let muted = Color(red: 0.70, green: 0.78, blue: 0.73)
    static let positive = Color(red: 0.57, green: 0.84, blue: 0.66)
    static let negative = Color(red: 0.94, green: 0.64, blue: 0.56)
}

private struct PortfolioSmallView: View {
    let entry: PortfolioEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("PortfolioPilot", systemImage: "chart.bar.fill")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(.white)

            Spacer(minLength: 2)

            if let snapshot = entry.snapshot {
                Text("投資組合總值")
                    .font(.caption2)
                    .foregroundStyle(WidgetPalette.muted)
                Text(snapshot.totalTwd.formatted(.currency(code: "TWD").precision(.fractionLength(0))))
                    .font(.system(size: 21, weight: .bold, design: .rounded))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .foregroundStyle(.white)
                    .privacySensitive()
                if let change = snapshot.gainPct {
                    Text(String(format: "%+.2f%%", change))
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundStyle(change >= 0 ? WidgetPalette.positive : WidgetPalette.negative)
                        .privacySensitive()
                }
                Text("本機資料 · 非即時")
                    .font(.system(size: 10))
                    .foregroundStyle(WidgetPalette.muted)
            } else {
                Text("保護你的投資資料")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                Text("開啟 App 後才會設定小工具資料")
                    .font(.caption2)
                    .foregroundStyle(WidgetPalette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(WidgetPalette.background, for: .widget)
        .widgetURL(URL(string: "portfoliopilot://portfolio?tab=risk"))
    }
}

private struct WatchlistRow: View {
    let item: SharedSnapshot.WatchItem

    var body: some View {
        HStack(spacing: 8) {
            Text(item.symbol)
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundStyle(.white)
                .frame(width: 64, alignment: .leading)
            Text(item.name)
                .font(.system(size: 12))
                .foregroundStyle(WidgetPalette.muted)
                .lineLimit(1)
            Spacer(minLength: 4)
            Text(String(format: "%.2f", item.close))
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundStyle(.white)
                .privacySensitive()
            if let change = item.changePct {
                Text(String(format: "%+.2f%%", change))
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(change >= 0 ? WidgetPalette.positive : WidgetPalette.negative)
                    .privacySensitive()
                    .frame(width: 64, alignment: .trailing)
            }
        }
    }
}

private struct WatchlistMediumView: View {
    let entry: PortfolioEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("自選股", systemImage: "chart.line.uptrend.xyaxis")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white)
                Spacer()
                Text("最近收盤 · 非即時")
                    .font(.system(size: 10))
                    .foregroundStyle(WidgetPalette.muted)
            }

            if let snapshot = entry.snapshot, !snapshot.watchlist.isEmpty {
                ForEach(Array(snapshot.watchlist.prefix(3))) { item in
                    WatchlistRow(item: item)
                }
                Spacer(minLength: 0)
                Text("資料日：\(snapshot.quoteDate ?? "未確認")")
                    .font(.system(size: 10))
                    .foregroundStyle(WidgetPalette.muted)
            } else {
                Spacer(minLength: 0)
                Text("尚未啟用自選股小工具")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                Text("資料不會自動顯示於鎖定或主畫面")
                    .font(.caption)
                    .foregroundStyle(WidgetPalette.muted)
                Spacer(minLength: 0)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(WidgetPalette.background, for: .widget)
        .widgetURL(URL(string: "portfoliopilot://portfolio?tab=risk"))
    }
}

private struct PortfolioOverviewWidget: Widget {
    let kind = "PortfolioPilotPortfolioOverview"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PortfolioProvider()) { entry in
            PortfolioSmallView(entry: entry)
        }
        .configurationDisplayName("投資總覽")
        .description("查看最後同步的本機投資摘要，非即時報價。")
        .supportedFamilies([.systemSmall])
    }
}

private struct PortfolioWatchlistWidget: Widget {
    let kind = "PortfolioPilotWatchlist"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PortfolioProvider()) { entry in
            WatchlistMediumView(entry: entry)
        }
        .configurationDisplayName("自選股收盤資訊")
        .description("查看本機同意共享的最新官方收盤快照。")
        .supportedFamilies([.systemMedium])
    }
}

@main
struct PortfolioPilotWidgets: WidgetBundle {
    var body: some Widget {
        PortfolioOverviewWidget()
        PortfolioWatchlistWidget()
    }
}
