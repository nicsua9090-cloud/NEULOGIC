// ============================================================
// NeuroSense - Codigo MakeCode JavaScript para micro:bit + IoT:bit
// ============================================================
// Este codigo se copia y pega directamente en el editor
// JavaScript de MakeCode (https://makecode.microbit.org)
//
// Hardware requerido:
//   - micro:bit V2
//   - Elecfreaks IoT:bit (con modulo ESP8266)
//   - Sensor GSR conectado a pin P1
//   - Sensor de sonido conectado a pin P2
//   - El acelerometro integrado del micro:bit se usa directamente
//
// Conexion IoT:bit:
//   - ESP8266 TX -> micro:bit P8 (RX)
//   - ESP8266 RX -> micro:bit P12 (TX)
//   - Baudrate: 115200
// ============================================================

// ====== CONFIGURACION - MODIFICAR ESTOS VALORES ======
let WIFI_SSID = "TU_WIFI_SSID"
let WIFI_PASS = "TU_WIFI_PASSWORD"
let SERVER_HOST = "TU_SERVIDOR.vercel.app"
let SERVER_PATH = "/api/v1/microbit"
let SERVER_PORT = 443  // 443 para HTTPS, 80 para HTTP
let DEVICE_CODE = "bit_0001"
let API_KEY = "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918"
let SEND_INTERVAL = 5000 // Milisegundos entre envios (5 segundos)
// =====================================================

let wifiConnected = false
let sendingData = false
let serialResponse = ""
let lastSend = 0

// Iniciar al encender
basic.showString("NS")
basic.pause(500)

// Configurar serial para comunicacion con ESP8266 del IoT:bit
serial.redirect(SerialPin.P8, SerialPin.P12, BaudRate.BaudRate115200)
basic.pause(100)

// ====== FUNCIONES DE COMUNICACION ESP8266 ======

function sendAT(cmd: string, waitMs: number): string {
    serialResponse = ""
    serial.writeString(cmd + "\r\n")
    basic.pause(waitMs)
    return serialResponse
}

// Capturar respuestas del ESP8266
serial.onDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    let incoming = serial.readString()
    serialResponse = serialResponse + incoming
})

function resetESP() {
    basic.showLeds(`
        . . # . .
        . # . # .
        . # . # .
        . # . # .
        . . # . .
    `)
    sendAT("AT+RST", 2000)
    sendAT("AT+CWMODE=1", 500)
}

function connectWifi() {
    basic.showLeds(`
        . . . . .
        . . . . .
        # # # # #
        . . . . .
        . . . . .
    `)

    let response = sendAT("AT+CWJAP=\"" + WIFI_SSID + "\",\"" + WIFI_PASS + "\"", 10000)

    if (response.includes("OK") || response.includes("WIFI CONNECTED")) {
        wifiConnected = true
        basic.showLeds(`
            . . . . #
            . . . # .
            # . # . .
            . # . . .
            . . . . .
        `)
        basic.pause(500)
    } else {
        wifiConnected = false
        basic.showLeds(`
            # . . . #
            . # . # .
            . . # . .
            . # . # .
            # . . . #
        `)
        basic.pause(1000)
    }
}

function readSensors(): string {
    // Leer GSR del pin P1 (analogico, 0-1023)
    let gsr = pins.analogReadPin(AnalogPin.P1)

    // Leer sonido del pin P2 (analogico, 0-1023, escalar a 0-255)
    let soundRaw = pins.analogReadPin(AnalogPin.P2)
    let sound = Math.round(soundRaw / 4) // Escalar 0-1023 a 0-255

    // Leer acelerometro integrado (en mg)
    let ax = input.acceleration(Dimension.X)
    let ay = input.acceleration(Dimension.Y)
    let az = input.acceleration(Dimension.Z)

    // Construir JSON compacto
    let json = "{\"d\":\"" + DEVICE_CODE
        + "\",\"k\":\"" + API_KEY
        + "\",\"g\":" + gsr
        + ",\"s\":" + sound
        + ",\"x\":" + ax
        + ",\"y\":" + ay
        + ",\"z\":" + az + "}"

    return json
}

function sendHTTPPost(jsonBody: string): boolean {
    // Abrir conexion TCP al servidor
    let connCmd = "AT+CIPSTART=\"TCP\",\"" + SERVER_HOST + "\"," + SERVER_PORT
    let connResp = sendAT(connCmd, 5000)

    if (!connResp.includes("OK") && !connResp.includes("ALREADY CONNECTED")) {
        return false
    }
    basic.pause(200)

    // Construir HTTP POST request
    let httpRequest = "POST " + SERVER_PATH + " HTTP/1.1\r\n"
        + "Host: " + SERVER_HOST + "\r\n"
        + "Content-Type: application/json\r\n"
        + "Content-Length: " + jsonBody.length + "\r\n"
        + "Connection: close\r\n"
        + "\r\n"
        + jsonBody

    // Enviar longitud de datos
    let sendCmd = "AT+CIPSEND=" + httpRequest.length
    let sendResp = sendAT(sendCmd, 1000)

    if (!sendResp.includes(">")) {
        // Cerrar conexion si fallo
        sendAT("AT+CIPCLOSE", 500)
        return false
    }

    // Enviar datos HTTP
    serialResponse = ""
    serial.writeString(httpRequest)
    basic.pause(5000) // Esperar respuesta del servidor

    let success = serialResponse.includes("\"ok\":1") || serialResponse.includes("SEND OK")

    // Cerrar conexion
    sendAT("AT+CIPCLOSE", 500)

    return success
}

// ====== SECUENCIA DE INICIO ======

resetESP()
basic.pause(1000)
connectWifi()

// ====== BOTON A: Reenviar datos manualmente ======
input.onButtonPressed(Button.A, function () {
    if (!wifiConnected) {
        connectWifi()
        return
    }
    if (sendingData) return

    sendingData = true
    basic.showLeds(`
        . # # # .
        # . . . #
        # . . . #
        # . . . #
        . # # # .
    `)

    let data = readSensors()
    let ok = sendHTTPPost(data)

    if (ok) {
        basic.showLeds(`
            . . . . #
            . . . # .
            # . # . .
            . # . . .
            . . . . .
        `)
    } else {
        basic.showLeds(`
            # . . . #
            . # . # .
            . . # . .
            . # . # .
            # . . . #
        `)
    }
    basic.pause(1000)
    sendingData = false
})

// ====== BOTON B: Mostrar estado WiFi ======
input.onButtonPressed(Button.B, function () {
    if (wifiConnected) {
        basic.showString("OK")
    } else {
        basic.showString("NO")
    }
})

// ====== BOTON A+B: Reconectar WiFi ======
input.onButtonPressed(Button.AB, function () {
    wifiConnected = false
    resetESP()
    basic.pause(1000)
    connectWifi()
})

// ====== BUCLE PRINCIPAL: Envio automatico ======
basic.forever(function () {
    if (!wifiConnected || sendingData) {
        basic.pause(1000)
        return
    }

    if (input.runningTime() - lastSend < SEND_INTERVAL) {
        // Mostrar corazon latiendo mientras espera
        basic.showLeds(`
            . # . # .
            # # # # #
            # # # # #
            . # # # .
            . . # . .
        `)
        basic.pause(500)
        basic.showLeds(`
            . . . . .
            . # . # .
            . # # # .
            . . # . .
            . . . . .
        `)
        basic.pause(500)
        return
    }

    sendingData = true
    lastSend = input.runningTime()

    // Leer y enviar
    let sensorData = readSensors()
    let result = sendHTTPPost(sensorData)

    if (result) {
        // Breve check mark
        basic.showLeds(`
            . . . . #
            . . . # .
            # . # . .
            . # . . .
            . . . . .
        `)
    } else {
        // Breve X de error
        basic.showLeds(`
            # . . . #
            . # . # .
            . . # . .
            . # . # .
            # . . . #
        `)
        // Intentar reconectar si fallo
        wifiConnected = false
        basic.pause(2000)
        connectWifi()
    }

    basic.pause(500)
    sendingData = false
})
