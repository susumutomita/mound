import Foundation

enum MoundError: Error, LocalizedError {
    case binaryNotFound
    case spawnFailed(String)
    case nonZeroExit(code: Int32, stderr: String)
    case decode(Error)

    var errorDescription: String? {
        switch self {
        case .binaryNotFound:
            return "mound コマンドが見つかりません (brew install susumutomita/tap/mound か make install-local)"
        case .spawnFailed(let m):
            return "mound の起動に失敗: \(m)"
        case .nonZeroExit(let code, let stderr):
            return "mound exit \(code): \(stderr)"
        case .decode(let e):
            return "JSON decode 失敗: \(e.localizedDescription)"
        }
    }
}

struct MoundService {
    /// `mound` バイナリの絶対パスを解決する。よくあるパスを順に探索。
    static func resolveBinary(env: [String: String] = ProcessInfo.processInfo.environment) -> String? {
        if let override = env["MOUND_BIN"], FileManager.default.isExecutableFile(atPath: override) {
            return override
        }
        let candidates = [
            "/opt/homebrew/bin/mound",
            "/usr/local/bin/mound",
            (env["HOME"].map { "\($0)/.local/bin/mound" }) ?? "",
        ].filter { !$0.isEmpty }
        return candidates.first { FileManager.default.isExecutableFile(atPath: $0) }
    }

    /// `mound agenda --json` を実行して `Agenda` を返す。
    func fetchAgenda(horizonDays: Int = 7) async throws -> Agenda {
        guard let bin = MoundService.resolveBinary() else {
            throw MoundError.binaryNotFound
        }
        return try await run(
            binary: bin,
            args: ["agenda", "--horizon-days", String(horizonDays), "--json"]
        )
    }

    private func run<T: Decodable>(binary: String, args: [String]) async throws -> T {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: binary)
        process.arguments = args
        let stdout = Pipe()
        let stderr = Pipe()
        process.standardOutput = stdout
        process.standardError = stderr

        do {
            try process.run()
        } catch {
            throw MoundError.spawnFailed(error.localizedDescription)
        }

        return try await withCheckedThrowingContinuation { (cont: CheckedContinuation<T, Error>) in
            process.terminationHandler = { proc in
                let outData = (try? stdout.fileHandleForReading.readToEnd()) ?? Data()
                let errData = (try? stderr.fileHandleForReading.readToEnd()) ?? Data()
                let exitCode = proc.terminationStatus
                if exitCode != 0 {
                    let errStr = String(data: errData, encoding: .utf8) ?? "<binary>"
                    cont.resume(throwing: MoundError.nonZeroExit(code: exitCode, stderr: errStr))
                    return
                }
                do {
                    let decoded = try JSONDecoder().decode(T.self, from: outData)
                    cont.resume(returning: decoded)
                } catch {
                    cont.resume(throwing: MoundError.decode(error))
                }
            }
        }
    }
}
