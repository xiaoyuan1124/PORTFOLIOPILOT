import Foundation
import BackgroundTasks

// iOS decides whether/when to launch this request. This is a best-effort
// private-device refresh, not a guaranteed 15:30 timer or a cloud sync.
enum PortfolioDailyRefresh {
    static let identifier = "com.sy1124.portfoliopilot.daily-refresh"
    private static let storageKey = "portfoliopilot:native-state:v1"
    private static let quoteURL = URL(string: "https://xiaoyuan1124.github.io/PORTFOLIOPILOT/data/tw-quotes.json")!

    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: nil) { task in
            guard let appRefresh = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            handle(appRefresh)
        }
        schedule()
    }

    static func schedule() {
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: identifier)
        let request = BGAppRefreshTaskRequest(identifier: identifier)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Taipei")!
        let now = Date()
        var target = calendar.date(bySettingHour: 15, minute: 31, second: 0, of: now) ?? now
        if target <= now { target = calendar.date(byAdding: .day, value: 1, to: target) ?? now.addingTimeInterval(86400) }
        request.earliestBeginDate = target
        do { try BGTaskScheduler.shared.submit(request) }
        catch { NSLog("PortfolioPilot background refresh not scheduled: %@", String(describing: error)) }
    }

    private static func handle(_ task: BGAppRefreshTask) {
        schedule()
        let operation = Task {
            let success = await refreshVerifiedDailyClose()
            task.setTaskCompleted(success: success)
        }
        task.expirationHandler = { operation.cancel() }
    }

    private static func taipeiDay(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(identifier: "Asia/Taipei")!
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private static func number(_ value: Any?) -> Double? {
        guard let raw = value as? NSNumber else { return nil }
        let result = raw.doubleValue
        return result.isFinite ? result : nil
    }

    // Safely updates existing Taiwan securities using only a unique,
    // same-day TWSE/TPEx close. Never rewrites missing historical days.
    private static func refreshVerifiedDailyClose() async -> Bool {
        guard !Task.isCancelled else { return false }
        let defaults = UserDefaults.standard
        guard let initialRaw = defaults.string(forKey: storageKey),
              let envelopeData = initialRaw.data(using: .utf8),
              let envelope = (try? JSONSerialization.jsonObject(with: envelopeData)) as? [String: Any],
              (envelope["version"] as? Int) == 1,
              let revision = envelope["revision"] as? Int,
              revision > 0,
              var state = envelope["state"] as? [String: Any],
              state["dataMode"] as? String != "demo",
              var holdings = state["holdings"] as? [[String: Any]],
              !holdings.isEmpty else { return true }

        var request = URLRequest(url: quoteURL)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 18
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard !Task.isCancelled,
                  (response as? HTTPURLResponse)?.statusCode == 200,
                  let json = (try JSONSerialization.jsonObject(with: data)) as? [String: Any],
                  let quotes = json["quotes"] as? [[String: Any]],
                  let fx = number(state["usdTwd"]), fx > 0 else { return false }

            let today = taipeiDay(Date())
            // A delayed scheduled task must not post yesterday's quote as
            // today's new valuation; market closures remain unknown dates.
            let todayQuotes = quotes.filter {
                ($0["date"] as? String) == today &&
                (($0["market"] as? String) == "TWSE" || ($0["market"] as? String) == "TPEx") &&
                number($0["close"]) != nil && (number($0["close"]) ?? 0) > 0
            }
            guard !todayQuotes.isEmpty else { return true }

            var changed = false
            for index in holdings.indices {
                guard holdings[index]["market"] as? String == "TW",
                      holdings[index]["type"] as? String != "cash",
                      let symbol = holdings[index]["symbol"] as? String else { continue }
                let venue = holdings[index]["priceSource"] as? String
                let matches = todayQuotes.filter {
                    ($0["code"] as? String)?.uppercased() == symbol.uppercased() &&
                    (venue != "TWSE" && venue != "TPEx" || ($0["market"] as? String) == venue)
                }
                guard matches.count == 1, let row = matches.first,
                      let close = number(row["close"]), close > 0 else { continue }
                if let previous = holdings[index]["priceAsOf"] as? String, previous > today { continue }
                let previousPrice = number(holdings[index]["price"])
                if (holdings[index]["priceAsOf"] as? String) == today && previousPrice == close { continue }
                holdings[index]["price"] = close
                holdings[index]["priceSource"] = row["market"]
                holdings[index]["priceAsOf"] = today
                changed = true
            }
            guard changed && !Task.isCancelled else { return true }

            var total = 0.0
            var cost = 0.0
            for holding in holdings {
                guard let quantity = number(holding["quantity"]), quantity >= 0,
                      let price = number(holding["price"]), price >= 0,
                      let averageCost = number(holding["averageCost"]), averageCost >= 0 else { return false }
                let multiplier = holding["currency"] as? String == "USD" ? fx : 1.0
                let holdingValue = quantity * price * multiplier
                let holdingCost = holding["type"] as? String == "cash" ? holdingValue : quantity * averageCost * multiplier
                guard holdingValue.isFinite && holdingCost.isFinite else { return false }
                total += holdingValue
                cost += holdingCost
            }
            guard total.isFinite && cost.isFinite else { return false }

            var snapshots = state["snapshots"] as? [[String: Any]] ?? []
            snapshots.removeAll { ($0["date"] as? String) == today }
            snapshots.append([
                "date": today, "total": total, "cost": cost,
                "gain": total - cost, "usdTwd": fx
            ])
            snapshots.sort { ($0["date"] as? String ?? "") < ($1["date"] as? String ?? "") }
            if snapshots.count > 1825 { snapshots = Array(snapshots.suffix(1825)) }
            state["holdings"] = holdings
            state["snapshots"] = snapshots

            // Fail closed if the JS foreground writer changed the state while
            // the network request was in flight.
            guard !Task.isCancelled, defaults.string(forKey: storageKey) == initialRaw else { return false }
            let nextRevision = max(revision + 1, Int(Date().timeIntervalSince1970 * 1000))
            let newEnvelope: [String: Any] = ["version": 1, "revision": nextRevision, "state": state]
            let encoded = try JSONSerialization.data(withJSONObject: newEnvelope, options: [.sortedKeys])
            guard let output = String(data: encoded, encoding: .utf8) else { return false }
            defaults.set(output, forKey: storageKey)
            return true
        } catch {
            return false
        }
    }
}
