import XCTest
@testable import MoundMenuBar

final class AgendaTests: XCTestCase {
    func test_mound_agendaのJSON出力をデコードできる() throws {
        let json = #"""
        {
          "generated_at": "2026-05-20T10:00:00.000Z",
          "team_id": "t1",
          "horizon_days": 7,
          "needs_publish": [
            {
              "id": "g1",
              "team_id": "t1",
              "title": "公開忘れ",
              "status": "DRAFT",
              "game_date": "2026-06-01",
              "ground_name": null,
              "min_players": 9,
              "note": null,
              "created_at": "2026-05-20T00:00:00.000Z",
              "updated_at": "2026-05-20T00:00:00.000Z"
            }
          ],
          "collecting": [
            {
              "game": {
                "id": "g2",
                "team_id": "t1",
                "title": "集めてる",
                "status": "COLLECTING",
                "game_date": "2026-06-05",
                "ground_name": "公園",
                "min_players": 9,
                "note": null,
                "created_at": "2026-05-20T00:00:00.000Z",
                "updated_at": "2026-05-20T00:00:00.000Z"
              },
              "rsvp": { "available": 9, "unavailable": 0, "maybe": 0, "no_response": 1 },
              "ready_to_confirm": true,
              "shortage": 0
            }
          ],
          "upcoming": [],
          "needs_completion": [],
          "needs_settlement": []
        }
        """#

        let data = json.data(using: .utf8)!
        let agenda = try JSONDecoder().decode(Agenda.self, from: data)

        XCTAssertEqual(agenda.needs_publish.count, 1)
        XCTAssertEqual(agenda.needs_publish.first?.title, "公開忘れ")
        XCTAssertEqual(agenda.collecting.count, 1)
        XCTAssertEqual(agenda.collecting.first?.ready_to_confirm, true)
        XCTAssertEqual(agenda.totalAttention, 2)
    }

    func test_totalAttention_は5バケットのうち4種類を合算する() {
        let game = Game(
            id: "x", team_id: "t", title: "x", status: "DRAFT",
            game_date: nil, ground_name: nil, min_players: 9, note: nil,
            created_at: "", updated_at: ""
        )
        let agenda = Agenda(
            generated_at: "",
            team_id: nil,
            horizon_days: 7,
            needs_publish: [game, game],
            collecting: [],
            upcoming: [
                Upcoming(game: game, days_until: 3),
                Upcoming(game: game, days_until: 5),
            ],
            needs_completion: [game],
            needs_settlement: [game]
        )

        // needs_publish(2) + collecting(0) + needs_completion(1) + needs_settlement(1) = 4
        // upcoming は注意喚起ではないので含めない
        XCTAssertEqual(agenda.totalAttention, 4)
    }
}

final class MoundServiceTests: XCTestCase {
    func test_resolveBinary_はMOUND_BINが実行可能ならそれを使う() throws {
        let tmp = NSTemporaryDirectory() + "mound-test-bin"
        FileManager.default.createFile(atPath: tmp, contents: Data("#!/bin/sh\n".utf8))
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o755],
            ofItemAtPath: tmp
        )
        defer { try? FileManager.default.removeItem(atPath: tmp) }

        let resolved = MoundService.resolveBinary(env: ["MOUND_BIN": tmp])
        XCTAssertEqual(resolved, tmp)
    }

    func test_resolveBinary_は存在しないMOUND_BINを返さない() {
        let resolved = MoundService.resolveBinary(env: ["MOUND_BIN": "/no/such/bin"])
        // フォールバック候補 (/opt/homebrew/bin/mound 等) が無ければ nil、
        // あればそれを返すので nil チェックではなく "渡したパスではない" を検証
        XCTAssertNotEqual(resolved, "/no/such/bin")
    }
}
