import SwiftUI

struct AgendaView: View {
    @ObservedObject var store: AgendaStore

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            header
            Divider()
            content
            Divider()
            footer
        }
        .padding(12)
        .frame(width: 320)
    }

    private var header: some View {
        HStack {
            Image(systemName: "baseball.fill")
            Text("mound")
                .font(.system(size: 14, weight: .semibold))
            Spacer()
            if store.isLoading {
                ProgressView().scaleEffect(0.5)
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        if let err = store.lastError, store.agenda == nil {
            errorState(err)
        } else if let a = store.agenda {
            buckets(a)
        } else {
            Text("読み込み中…").foregroundColor(.secondary)
        }
    }

    private func errorState(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("接続できません").font(.headline)
            Text(message)
                .font(.caption)
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func buckets(_ a: Agenda) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            row(symbol: "doc.plaintext",
                title: "公開待ち",
                count: a.needs_publish.count,
                tint: a.needs_publish.isEmpty ? .secondary : .orange)
            collectingRow(a.collecting)
            row(symbol: "calendar",
                title: "開催間近 (≤\(a.horizon_days)日)",
                count: a.upcoming.count,
                tint: a.upcoming.isEmpty ? .secondary : .accentColor)
            row(symbol: "checkmark.circle",
                title: "完了入力待ち",
                count: a.needs_completion.count,
                tint: a.needs_completion.isEmpty ? .secondary : .orange)
            row(symbol: "yensign.circle",
                title: "精算待ち",
                count: a.needs_settlement.count,
                tint: a.needs_settlement.isEmpty ? .secondary : .orange)
        }
    }

    private func collectingRow(_ collecting: [Collecting]) -> some View {
        let readyCount = collecting.filter(\.ready_to_confirm).count
        let suffix = readyCount > 0 ? " (✅ \(readyCount) 確定可)" : ""
        return row(
            symbol: "person.3",
            title: "出欠集計中\(suffix)",
            count: collecting.count,
            tint: readyCount > 0 ? .green : (collecting.isEmpty ? .secondary : .accentColor)
        )
    }

    private func row(symbol: String, title: String, count: Int, tint: Color) -> some View {
        HStack {
            Image(systemName: symbol).foregroundColor(tint)
            Text(title)
            Spacer()
            Text("\(count)")
                .font(.system(size: 12, weight: .medium, design: .monospaced))
                .foregroundColor(tint)
        }
    }

    private var footer: some View {
        HStack {
            if let t = store.lastFetchedAt {
                Text("更新: \(Self.timeFormatter.string(from: t))")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            } else {
                Spacer()
            }
            Spacer()
            Button("更新") { store.refresh() }
                .buttonStyle(.borderless)
                .font(.caption)
            Button("終了") { NSApplication.shared.terminate(nil) }
                .buttonStyle(.borderless)
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }

    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.timeStyle = .medium
        f.dateStyle = .none
        return f
    }()
}
