import Foundation
import WebKit

/// アプリのバンドルに入れた Web 版のファイルを `app://` で配信する。
///
/// なぜ file:// で直接読まないのか:
/// ゲーム本体は ES modules (`<script type="module">`) を使っている。
/// file:// はオリジンが null 扱いになるため CORS で module の読み込みが弾かれる。
/// 独自スキームなら通常のオリジンとして扱われるので、そのまま動く。
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "app"
    static let host = "game"

    /// バンドル内の Web ディレクトリ（ここより外は読ませない）
    private let root: URL

    init(root: URL) {
        self.root = root.standardizedFileURL
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url, let fileURL = resolve(url) else {
            task.didFailWithError(URLError(.badURL))
            return
        }

        do {
            let data = try Data(contentsOf: fileURL)
            let response = URLResponse(
                url: url,
                mimeType: Self.mimeType(for: fileURL.pathExtension),
                expectedContentLength: data.count,
                textEncodingName: "utf-8"
            )
            task.didReceive(response)
            task.didReceive(data)
            task.didFinish()
        } catch {
            task.didFailWithError(error)
        }
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        // 読み込みは同期で終わるので、途中で止めるものは無い
    }

    /// URL のパスをバンドル内のファイルに変換する。root の外は拒否する。
    private func resolve(_ url: URL) -> URL? {
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }

        let candidate = root.appendingPathComponent(path).standardizedFileURL
        guard candidate.path.hasPrefix(root.path) else { return nil }
        guard FileManager.default.fileExists(atPath: candidate.path) else { return nil }
        return candidate
    }

    private static func mimeType(for pathExtension: String) -> String {
        switch pathExtension.lowercased() {
        case "html": return "text/html"
        case "css": return "text/css"
        case "js", "mjs": return "text/javascript"
        case "json": return "application/json"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        // BGM。これが octet-stream のままだと <audio> が鳴らない
        case "mp3": return "audio/mpeg"
        case "m4a": return "audio/mp4"
        case "wav": return "audio/wav"
        case "ogg": return "audio/ogg"
        default: return "application/octet-stream"
        }
    }
}
