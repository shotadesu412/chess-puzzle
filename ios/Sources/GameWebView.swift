import SwiftUI
import WebKit

/// Web 版のゲームをそのまま表示する WKWebView。
struct GameWebView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()

        // バンドル内の Web ディレクトリを app:// で配信する
        let webRoot = Bundle.main.bundleURL.appendingPathComponent("Web")
        configuration.setURLSchemeHandler(
            BundleSchemeHandler(root: webRoot),
            forURLScheme: BundleSchemeHandler.scheme
        )

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = .black
        // ゲーム画面なので、引っぱったときの跳ね返りとズームは切る
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        #if DEBUG
        // Mac の Safari から中を覗けるようにしておく
        if webView.responds(to: Selector(("setInspectable:"))) {
            webView.isInspectable = true
        }
        #endif

        let url = URL(string: "\(BundleSchemeHandler.scheme)://\(BundleSchemeHandler.host)/index.html")!
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        // 表示するだけなので更新するものは無い
    }
}
