import UIKit
import WebKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

/// Pantalla principal: el CRM dentro de la vista web de Capacitor, con los ajustes que la hacen sentir como app.
/// El CRM no se modifica: lo que la app necesita distinto se inyecta desde aquí.
class CrmViewController: CAPBridgeViewController {

    override func capacitorDidLoad() {
        // Deslizar desde el borde izquierdo vuelve a la pantalla anterior, como en cualquier app de iPhone.
        webView?.allowsBackForwardNavigationGestures = true

        guard let controller = webView?.configuration.userContentController else { return }
        let host = bridge?.config.serverURL.host ?? ""

        // Antes de que cargue la página: el CRM se comporta como «app instalada» (no ofrece instalarse otra vez).
        let atStart = """
        (function () {
          if (location.hostname !== '\(host)') return;
          try { Object.defineProperty(navigator, 'standalone', { get: function () { return true; } }); } catch (e) {}
        })();
        """
        // Al terminar de cargar: campos a 16 px (iOS no amplía la página al escribir), se quita la pantalla de arranque
        // y la hora y la batería cambian de color según lo que quede debajo (cabecera oscura → blancas; página clara → oscuras).
        let atEnd = """
        (function () {
          var native = window.Capacitor && window.Capacitor.nativePromise ? window.Capacitor.nativePromise : null;
          function call(plugin, method, options) {
            if (native) native(plugin, method, options).catch(function () {});
          }
          call('SplashScreen', 'hide', { fadeOutDuration: 250 });
          if (location.hostname !== '\(host)' || !document.head) return;

          var style = document.createElement('style');
          style.textContent = '@media (pointer: coarse) { input, select, textarea { font-size: 16px !important; } }';
          document.head.appendChild(style);

          // Se mira qué hay debajo de la hora: se suman los fondos de lo que esté en ese punto (cabecera, velo de un
          // panel abierto, fondo de la página) y, si el resultado es oscuro, la hora y la batería van en blanco.
          function shade(text) {
            var open = text.indexOf('(');
            if (open < 0) return null;
            var body = text.slice(open + 1);
            if (text.indexOf('color(') === 0) body = body.replace(/^\\s*\\S+\\s+/, '');
            var n = (body.match(/-?[0-9.]+%?/g) || []).map(function (v) {
              return v.slice(-1) === '%' ? parseFloat(v) / 100 : parseFloat(v);
            });
            if (n.length < 3) return null;
            var alpha = n.length > 3 ? n[3] : 1;
            if (text.indexOf('ok') === 0) return [n[0], alpha];
            var scale = text.indexOf('color(') === 0 ? 1 : 255;
            return [(0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2]) / scale, alpha];
          }
          var current = null;
          var timer = null;
          function update() {
            var stack = document.elementsFromPoint(Math.floor(window.innerWidth / 2), 1);
            var lightness = 1;
            for (var i = stack.length - 1; i >= 0; i--) {
              var css = getComputedStyle(stack[i]);
              var layers = [css.backgroundColor];
              var gradient = css.backgroundImage.indexOf('gradient') >= 0
                ? css.backgroundImage.match(/(rgba?|oklab|oklch|color)\\([^)]+\\)/) : null;
              if (gradient) layers.push(gradient[0]);
              for (var j = 0; j < layers.length; j++) {
                var layer = shade(layers[j]);
                if (layer && layer[1] > 0) lightness = lightness * (1 - layer[1]) + layer[0] * layer[1];
              }
            }
            var next = lightness < 0.5 ? 'DARK' : 'LIGHT';
            if (next !== current) {
              current = next;
              call('StatusBar', 'setStyle', { style: next });
            }
          }
          function schedule() {
            clearTimeout(timer);
            timer = setTimeout(update, 150);
          }
          update();
          window.addEventListener('load', schedule);
          window.addEventListener('pageshow', schedule);
          new MutationObserver(schedule).observe(document.documentElement, {
            childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'open']
          });
          window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', schedule);
        })();
        """
        controller.addUserScript(WKUserScript(source: atStart, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        controller.addUserScript(WKUserScript(source: atEnd, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
    }
}
