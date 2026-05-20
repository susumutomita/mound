import Foundation

// `mound agenda --json` の出力に合わせた Codable 表現。
// 余分なフィールドは無視。

struct Agenda: Codable, Equatable {
    let generated_at: String
    let team_id: String?
    let horizon_days: Int
    let needs_publish: [Game]
    let collecting: [Collecting]
    let upcoming: [Upcoming]
    let needs_completion: [Game]
    let needs_settlement: [Game]
}

struct Game: Codable, Equatable, Identifiable {
    let id: String
    let team_id: String
    let title: String
    let status: String
    let game_date: String?
    let ground_name: String?
    let min_players: Int
    let note: String?
    let created_at: String
    let updated_at: String
}

struct RsvpSummary: Codable, Equatable {
    let available: Int
    let unavailable: Int
    let maybe: Int
    let no_response: Int
}

struct Collecting: Codable, Equatable, Identifiable {
    let game: Game
    let rsvp: RsvpSummary
    let ready_to_confirm: Bool
    let shortage: Int

    var id: String { game.id }
}

struct Upcoming: Codable, Equatable, Identifiable {
    let game: Game
    let days_until: Int

    var id: String { game.id }
}

extension Agenda {
    var totalAttention: Int {
        needs_publish.count
            + collecting.count
            + needs_completion.count
            + needs_settlement.count
    }
}
