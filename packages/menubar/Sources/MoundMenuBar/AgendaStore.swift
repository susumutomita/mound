import Foundation
import SwiftUI

@MainActor
final class AgendaStore: ObservableObject {
    @Published private(set) var agenda: Agenda?
    @Published private(set) var lastError: String?
    @Published private(set) var lastFetchedAt: Date?
    @Published private(set) var isLoading: Bool = false

    private let service = MoundService()
    private var task: Task<Void, Never>?
    private let pollInterval: TimeInterval = 30

    init() {
        start()
    }

    deinit {
        task?.cancel()
    }

    var badge: String {
        if let agenda = agenda {
            return "\(agenda.totalAttention)"
        }
        if lastError != nil { return "!" }
        return "–"
    }

    func refresh() {
        Task { await self.fetch() }
    }

    private func start() {
        task = Task { [weak self] in
            while !Task.isCancelled {
                await self?.fetch()
                try? await Task.sleep(nanoseconds: UInt64((self?.pollInterval ?? 30) * 1_000_000_000))
            }
        }
    }

    private func fetch() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let a = try await service.fetchAgenda()
            self.agenda = a
            self.lastError = nil
            self.lastFetchedAt = Date()
        } catch {
            self.lastError = error.localizedDescription
        }
    }
}
