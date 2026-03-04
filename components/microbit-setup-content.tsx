"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Cpu,
  Wifi,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Zap,
  Volume2,
  Activity,
  CircleAlert,
  ArrowRight,
} from "lucide-react"

const MAKECODE_CODE = `// ============================================================
// NeuroSense - micro:bit + IoT:bit
// ============================================================
// Pegar en: https://makecode.microbit.org (modo JavaScript)
//
// Hardware:
//   - micro:bit V2 + IoT:bit (ESP8266)
//   - Sensor GSR -> Pin P1
//   - Sensor Sonido -> Pin P2
//   - Acelerometro integrado del micro:bit
// ============================================================

// ====== CONFIGURACION ======
let WIFI_SSID = "TU_WIFI_SSID"
let WIFI_PASS = "TU_WIFI_PASSWORD"
let SERVER_HOST = "TU_SERVIDOR.vercel.app"
let SERVER_PATH = "/api/v1/microbit"
let SERVER_PORT = 443
let DEVICE_CODE = "bit_0001"
let API_KEY = "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918"
let SEND_INTERVAL = 5000
// ===========================

let wifiConnected = false
let sendingData = false
let serialResponse = ""
let lastSend = 0

basic.showString("NS")
basic.pause(500)
serial.redirect(SerialPin.P8, SerialPin.P12, BaudRate.BaudRate115200)
basic.pause(100)

function sendAT(cmd: string, waitMs: number): string {
    serialResponse = ""
    serial.writeString(cmd + "\\r\\n")
    basic.pause(waitMs)
    return serialResponse
}

serial.onDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    let incoming = serial.readString()
    serialResponse = serialResponse + incoming
})

function resetESP() {
    basic.showLeds(\`
        . . # . .
        . # . # .
        . # . # .
        . # . # .
        . . # . .
    \`)
    sendAT("AT+RST", 2000)
    sendAT("AT+CWMODE=1", 500)
}

function connectWifi() {
    basic.showLeds(\`
        . . . . .
        . . . . .
        # # # # #
        . . . . .
        . . . . .
    \`)
    let response = sendAT("AT+CWJAP=\\\\"" + WIFI_SSID + "\\\\",\\\\"" + WIFI_PASS + "\\\\"", 10000)
    if (response.includes("OK") || response.includes("WIFI CONNECTED")) {
        wifiConnected = true
        basic.showLeds(\`
            . . . . #
            . . . # .
            # . # . .
            . # . . .
            . . . . .
        \`)
        basic.pause(500)
    } else {
        wifiConnected = false
        basic.showLeds(\`
            # . . . #
            . # . # .
            . . # . .
            . # . # .
            # . . . #
        \`)
        basic.pause(1000)
    }
}

function readSensors(): string {
    let gsr = pins.analogReadPin(AnalogPin.P1)
    let soundRaw = pins.analogReadPin(AnalogPin.P2)
    let sound = Math.round(soundRaw / 4)
    let ax = input.acceleration(Dimension.X)
    let ay = input.acceleration(Dimension.Y)
    let az = input.acceleration(Dimension.Z)
    let json = "{\\\\"d\\\\":\\\\"" + DEVICE_CODE
        + "\\\\",\\\\"k\\\\":\\\\"" + API_KEY
        + "\\\\",\\\\"g\\\\":" + gsr
        + ",\\\\"s\\\\":" + sound
        + ",\\\\"x\\\\":" + ax
        + ",\\\\"y\\\\":" + ay
        + ",\\\\"z\\\\":" + az + "}"
    return json
}

function sendHTTPPost(jsonBody: string): boolean {
    let connCmd = "AT+CIPSTART=\\\\"TCP\\\\",\\\\"" + SERVER_HOST + "\\\\"," + SERVER_PORT
    let connResp = sendAT(connCmd, 5000)
    if (!connResp.includes("OK") && !connResp.includes("ALREADY CONNECTED")) {
        return false
    }
    basic.pause(200)
    let httpRequest = "POST " + SERVER_PATH + " HTTP/1.1\\r\\n"
        + "Host: " + SERVER_HOST + "\\r\\n"
        + "Content-Type: application/json\\r\\n"
        + "Content-Length: " + jsonBody.length + "\\r\\n"
        + "Connection: close\\r\\n"
        + "\\r\\n"
        + jsonBody
    let sendCmd = "AT+CIPSEND=" + httpRequest.length
    let sendResp = sendAT(sendCmd, 1000)
    if (!sendResp.includes(">")) {
        sendAT("AT+CIPCLOSE", 500)
        return false
    }
    serialResponse = ""
    serial.writeString(httpRequest)
    basic.pause(5000)
    let success = serialResponse.includes("\\\\"ok\\\\":1") || serialResponse.includes("SEND OK")
    sendAT("AT+CIPCLOSE", 500)
    return success
}

resetESP()
basic.pause(1000)
connectWifi()

input.onButtonPressed(Button.A, function () {
    if (!wifiConnected) { connectWifi(); return }
    if (sendingData) return
    sendingData = true
    let data = readSensors()
    let ok = sendHTTPPost(data)
    if (ok) {
        basic.showLeds(\`
            . . . . #
            . . . # .
            # . # . .
            . # . . .
            . . . . .
        \`)
    } else {
        basic.showLeds(\`
            # . . . #
            . # . # .
            . . # . .
            . # . # .
            # . . . #
        \`)
    }
    basic.pause(1000)
    sendingData = false
})

input.onButtonPressed(Button.B, function () {
    if (wifiConnected) { basic.showString("OK") }
    else { basic.showString("NO") }
})

input.onButtonPressed(Button.AB, function () {
    wifiConnected = false
    resetESP()
    basic.pause(1000)
    connectWifi()
})

basic.forever(function () {
    if (!wifiConnected || sendingData) { basic.pause(1000); return }
    if (input.runningTime() - lastSend < SEND_INTERVAL) {
        basic.showLeds(\`
            . # . # .
            # # # # #
            # # # # #
            . # # # .
            . . # . .
        \`)
        basic.pause(500)
        basic.showLeds(\`
            . . . . .
            . # . # .
            . # # # .
            . . # . .
            . . . . .
        \`)
        basic.pause(500)
        return
    }
    sendingData = true
    lastSend = input.runningTime()
    let sensorData = readSensors()
    let result = sendHTTPPost(sensorData)
    if (result) {
        basic.showLeds(\`
            . . . . #
            . . . # .
            # . # . .
            . # . . .
            . . . . .
        \`)
    } else {
        basic.showLeds(\`
            # . . . #
            . # . # .
            . . # . .
            . # . # .
            # . . . #
        \`)
        wifiConnected = false
        basic.pause(2000)
        connectWifi()
    }
    basic.pause(500)
    sendingData = false
})`

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="gap-2"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" />
          <span>Copiado</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          <span>{label ?? "Copiar"}</span>
        </>
      )}
    </Button>
  )
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-muted/50 transition-colors rounded-lg"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {title}
      </button>
      {open && <div className="border-t border-border px-4 py-4">{children}</div>}
    </div>
  )
}

export function MicrobitSetupContent() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground text-balance">
          Configurar micro:bit con IoT:bit
        </h1>
        <p className="mt-1 text-muted-foreground text-pretty">
          Conecta tu micro:bit al servidor NeuroSense para enviar datos de sensores en tiempo real.
        </p>
      </div>

      {/* Quick Overview */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">GSR</p>
              <p className="text-xs text-muted-foreground">Pin P1 (analogico)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Volume2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Sonido</p>
              <p className="text-xs text-muted-foreground">Pin P2 (analogico)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Acelerometro</p>
              <p className="text-xs text-muted-foreground">Integrado micro:bit</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Step 1: Hardware */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="h-7 w-7 shrink-0 items-center justify-center rounded-full p-0 text-xs font-bold">
              1
            </Badge>
            <div>
              <CardTitle className="text-lg">Conexion de Hardware</CardTitle>
              <CardDescription>Conecta los sensores al IoT:bit</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-4">
            <h4 className="mb-3 text-sm font-semibold text-foreground">Diagrama de conexion</h4>
            <div className="space-y-2 font-mono text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="inline-block w-36 text-foreground">Sensor GSR</span>
                <ArrowRight className="h-3.5 w-3.5" />
                <span>IoT:bit Pin P1 (analogico)</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="inline-block w-36 text-foreground">Sensor Sonido</span>
                <ArrowRight className="h-3.5 w-3.5" />
                <span>IoT:bit Pin P2 (analogico)</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="inline-block w-36 text-foreground">Acelerometro</span>
                <ArrowRight className="h-3.5 w-3.5" />
                <span>Integrado en micro:bit (no requiere cable)</span>
              </div>
              <div className="mt-3 flex items-center gap-2 text-muted-foreground">
                <span className="inline-block w-36 text-foreground">micro:bit</span>
                <ArrowRight className="h-3.5 w-3.5" />
                <span>Insertar en el slot del IoT:bit</span>
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-sm text-muted-foreground">
              Asegurate de que el IoT:bit este alimentado por USB o bateria.
              El ESP8266 requiere mas corriente que el micro:bit solo.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Step 2: MakeCode */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="h-7 w-7 shrink-0 items-center justify-center rounded-full p-0 text-xs font-bold">
                2
              </Badge>
              <div>
                <CardTitle className="text-lg">Codigo MakeCode</CardTitle>
                <CardDescription>Copia el codigo y pegalo en MakeCode</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CopyButton text={MAKECODE_CODE} label="Copiar codigo" />
              <Button variant="outline" size="sm" asChild>
                <a
                  href="https://makecode.microbit.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gap-2"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Abrir MakeCode</span>
                </a>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-4">
            <h4 className="mb-2 text-sm font-semibold text-foreground">Instrucciones</h4>
            <ol className="list-inside list-decimal space-y-1.5 text-sm text-muted-foreground">
              <li>
                Abre{" "}
                <a
                  href="https://makecode.microbit.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  makecode.microbit.org
                </a>
              </li>
              <li>Crea un nuevo proyecto</li>
              <li>Cambia al modo <strong className="text-foreground">JavaScript</strong> (arriba del editor)</li>
              <li>Borra todo el codigo existente</li>
              <li>Pega el codigo copiado de abajo</li>
              <li>
                Modifica las variables de configuracion (ver Paso 3)
              </li>
              <li>Descarga el archivo .hex al micro:bit</li>
            </ol>
          </div>

          {/* Code block */}
          <div className="relative">
            <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-border bg-muted px-4 py-2">
              <span className="text-xs font-medium text-muted-foreground">neurosense-microbit.js</span>
              <CopyButton text={MAKECODE_CODE} />
            </div>
            <div className="max-h-96 overflow-auto rounded-b-lg border border-border bg-card">
              <pre className="p-4 text-xs leading-relaxed text-foreground">
                <code>{MAKECODE_CODE}</code>
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 3: Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="h-7 w-7 shrink-0 items-center justify-center rounded-full p-0 text-xs font-bold">
              3
            </Badge>
            <div>
              <CardTitle className="text-lg">Configuracion</CardTitle>
              <CardDescription>Modifica estas variables en el codigo</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-4 text-left font-medium text-foreground">Variable</th>
                  <th className="py-2 pr-4 text-left font-medium text-foreground">Descripcion</th>
                  <th className="py-2 text-left font-medium text-foreground">Ejemplo</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border/50">
                  <td className="py-2.5 pr-4">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">WIFI_SSID</code>
                  </td>
                  <td className="py-2.5 pr-4">Nombre de tu red WiFi</td>
                  <td className="py-2.5">
                    <code className="text-xs">{"\"MiWiFi\""}</code>
                  </td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2.5 pr-4">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">WIFI_PASS</code>
                  </td>
                  <td className="py-2.5 pr-4">Contrasena de tu red WiFi</td>
                  <td className="py-2.5">
                    <code className="text-xs">{"\"password123\""}</code>
                  </td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2.5 pr-4">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">SERVER_HOST</code>
                  </td>
                  <td className="py-2.5 pr-4">URL de tu servidor NeuroSense (sin https://)</td>
                  <td className="py-2.5">
                    <code className="text-xs">{"\"mi-app.vercel.app\""}</code>
                  </td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2.5 pr-4">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">SERVER_PORT</code>
                  </td>
                  <td className="py-2.5 pr-4">Puerto (443 para HTTPS, 80 para HTTP)</td>
                  <td className="py-2.5">
                    <code className="text-xs">443</code>
                  </td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2.5 pr-4">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">DEVICE_CODE</code>
                  </td>
                  <td className="py-2.5 pr-4">Codigo del dispositivo registrado</td>
                  <td className="py-2.5">
                    <code className="text-xs">{"\"bit_0001\""}</code>
                  </td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2.5 pr-4">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">API_KEY</code>
                  </td>
                  <td className="py-2.5 pr-4">Hash SHA-256 del password del dispositivo</td>
                  <td className="py-2.5">
                    <code className="text-xs">{"\"8c6976e5...\" (demo)"}</code>
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">SEND_INTERVAL</code>
                  </td>
                  <td className="py-2.5 pr-4">Intervalo de envio en milisegundos</td>
                  <td className="py-2.5">
                    <code className="text-xs">5000 (5 seg)</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Step 4: Test */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="h-7 w-7 shrink-0 items-center justify-center rounded-full p-0 text-xs font-bold">
              4
            </Badge>
            <div>
              <CardTitle className="text-lg">Verificar Conexion</CardTitle>
              <CardDescription>Prueba que el micro:bit se conecta al servidor</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Indicadores LED del micro:bit</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-success/10 font-mono text-xs text-success">
                  {"\\u2713"}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Check mark</p>
                  <p className="text-xs text-muted-foreground">Datos enviados correctamente</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-destructive/10 font-mono text-xs text-destructive">
                  X
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">X (cruz)</p>
                  <p className="text-xs text-muted-foreground">Error de conexion o envio</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary/10 font-mono text-xs text-primary">
                  {"<3"}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Corazon parpadeando</p>
                  <p className="text-xs text-muted-foreground">Conectado, esperando proximo envio</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted font-mono text-xs text-foreground">
                  --
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Linea horizontal</p>
                  <p className="text-xs text-muted-foreground">Conectando a WiFi...</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Controles de botones</h4>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">Boton A:</strong> Enviar datos manualmente (lectura inmediata)
              </p>
              <p>
                <strong className="text-foreground">Boton B:</strong> Ver estado WiFi (muestra "OK" o "NO")
              </p>
              <p>
                <strong className="text-foreground">A + B:</strong> Reconectar WiFi (reset ESP8266)
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 p-4">
            <h4 className="mb-2 text-sm font-semibold text-foreground">Probar endpoint del servidor</h4>
            <p className="mb-3 text-sm text-muted-foreground">
              Puedes verificar que el servidor esta listo enviando una peticion GET:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded border border-border bg-card px-3 py-2 text-xs text-foreground">
                GET /api/v1/microbit
              </code>
              <CopyButton
                text={`curl ${typeof window !== "undefined" ? window.location.origin : "https://tu-servidor.vercel.app"}/api/v1/microbit`}
                label="Copiar curl"
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {"Respuesta esperada: {\"ok\":1,\"v\":\"microbit\"}"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Troubleshooting */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Cpu className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Solucion de problemas</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <CollapsibleSection title="El micro:bit muestra X constantemente">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>El ESP8266 no puede conectarse al servidor. Verifica:</p>
              <ul className="list-inside list-disc space-y-1 pl-2">
                <li>El SSID y password del WiFi son correctos</li>
                <li>El WiFi es de 2.4 GHz (el ESP8266 no soporta 5 GHz)</li>
                <li>El SERVER_HOST es correcto (sin "https://")</li>
                <li>El IoT:bit tiene alimentacion suficiente</li>
              </ul>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Se conecta a WiFi pero no envia datos">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>La conexion TCP al servidor falla. Posibles causas:</p>
              <ul className="list-inside list-disc space-y-1 pl-2">
                <li>
                  <strong className="text-foreground">HTTPS:</strong> El ESP8266 del IoT:bit puede no soportar SSL/TLS.
                  Si tu servidor requiere HTTPS, considera usar un proxy HTTP o el puerto 80.
                </li>
                <li>El DEVICE_CODE no esta registrado en el servidor</li>
                <li>El API_KEY no coincide con el password_hash del dispositivo</li>
              </ul>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Los datos aparecen como 0 en el dashboard">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Los sensores no estan conectados correctamente:</p>
              <ul className="list-inside list-disc space-y-1 pl-2">
                <li>Verifica que el sensor GSR esta en el pin P1</li>
                <li>Verifica que el sensor de sonido esta en el pin P2</li>
                <li>Asegurate de que los cables esten bien conectados al IoT:bit</li>
                <li>Los sensores necesitan alimentacion de 3.3V del IoT:bit</li>
              </ul>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Nota sobre HTTPS y el ESP8266">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                El modulo ESP8266 del IoT:bit tiene soporte limitado para HTTPS/SSL.
                Si tu servidor Vercel solo acepta HTTPS (que es lo predeterminado):
              </p>
              <ul className="list-inside list-disc space-y-1 pl-2">
                <li>Algunos firmwares del ESP8266 soportan <code className="rounded bg-muted px-1 text-xs text-foreground">AT+CIPSSL</code> para conexiones SSL basicas</li>
                <li>Alternativa: usa un servidor intermediario (proxy) que acepte HTTP y reenvie a HTTPS</li>
                <li>En desarrollo local, puedes usar un servidor HTTP en tu red</li>
              </ul>
            </div>
          </CollapsibleSection>
        </CardContent>
      </Card>

      {/* API Reference */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Wifi className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Referencia API</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="mb-2 text-sm font-semibold text-foreground">
              POST /api/v1/microbit
            </h4>
            <div className="rounded-lg border border-border bg-card">
              <pre className="p-4 text-xs leading-relaxed text-foreground">
                <code>{`// Request body (JSON compacto)
{
  "d": "bit_0001",     // device_code
  "k": "8c6976e5...",  // API key (password hash)
  "g": 512,            // GSR raw (0-1023)
  "s": 128,            // sonido raw (0-255)
  "x": 100,            // accel_x (mg)
  "y": -50,            // accel_y (mg)
  "z": 1024            // accel_z (mg)
}

// Response exitosa
{ "ok": 1, "si": 0.45, "a": 0 }
// si = stress_index, a = alertas generadas

// Response error
{ "ok": 0, "e": "Missing d,g,s" }`}</code>
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
