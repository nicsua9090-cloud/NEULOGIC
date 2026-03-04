import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import {
  kalmanFilter,
  normalizeGSR,
  normalizeSound,
  normalizeAccel,
  computeStressIndex,
  detectAlerts,
} from "@/lib/sensor-processing"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
  }
}

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, { status, headers: corsHeaders() })
}

// CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}

// Health check - micro:bit can verify connectivity
export async function GET() {
  return jsonResponse({ ok: 1, v: "microbit" })
}

/**
 * POST /api/v1/microbit
 *
 * Receives sensor data from micro:bit + IoT:bit (ESP8266).
 * Uses compact field names to minimize payload size (<256 bytes).
 *
 * Body (JSON):
 *   d  - device_code (string, e.g. "bit_0001")
 *   k  - api key / password hash (string)
 *   g  - GSR raw value (number, 0-1023)
 *   s  - sound raw value (number, 0-255)
 *   x  - accel_x in mg (number)
 *   y  - accel_y in mg (number)
 *   z  - accel_z in mg (number)
 *
 * Response: {"ok":1,"si":0.45} or {"ok":0,"e":"error message"}
 */
export async function POST(request: Request) {
  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ ok: 0, e: "Server config error" }, 500)
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse body - be tolerant of Content-Type since ESP8266 may not send it
    let body: Record<string, unknown>
    try {
      const text = await request.text()
      body = JSON.parse(text)
    } catch {
      return jsonResponse({ ok: 0, e: "Invalid JSON" }, 400)
    }

    const deviceCode = body.d as string | undefined
    const apiKey = body.k as string | undefined
    const gsrRaw = body.g as number | undefined
    const soundRaw = body.s as number | undefined
    const accelX = (body.x as number) ?? 0
    const accelY = (body.y as number) ?? 0
    const accelZ = (body.z as number) ?? 0

    // Validate required fields
    if (!deviceCode || gsrRaw === undefined || soundRaw === undefined) {
      return jsonResponse({ ok: 0, e: "Missing d,g,s" }, 400)
    }

    // Look up device
    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("id, password_hash")
      .eq("device_code", deviceCode)
      .single()

    if (deviceError || !device) {
      return jsonResponse({ ok: 0, e: "Unknown device" }, 404)
    }

    // Verify API key if provided and device has a password
    if (device.password_hash && apiKey && device.password_hash !== apiKey) {
      return jsonResponse({ ok: 0, e: "Bad key" }, 401)
    }

    // Normalize sensor values (reuse existing processing pipeline)
    const gsrNorm = normalizeGSR(gsrRaw / 1023) // Convert 0-1023 ADC to 0-1
    const soundNorm = normalizeSound(soundRaw)    // Already handles 0-255
    const accelNorm = normalizeAccel(accelX, accelY, accelZ)

    // Compute stress index with Kalman filter
    const rawStress = computeStressIndex(gsrNorm, soundNorm, accelNorm)
    const stressIndex = kalmanFilter(device.id, rawStress)

    const timestamp = Math.floor(Date.now() / 1000)

    // Store sensor data
    const { error: insertError } = await supabase.from("sensor_data").insert({
      device_id: device.id,
      gsr: gsrNorm,
      sound: soundNorm,
      accel_x: accelX,
      accel_y: accelY,
      accel_z: accelZ,
      stress_index: stressIndex,
      timestamp,
    })

    if (insertError) {
      return jsonResponse({ ok: 0, e: "DB error" }, 500)
    }

    // Detect and store alerts
    const alerts = detectAlerts(stressIndex, gsrNorm, soundNorm, accelNorm)
    if (alerts.length > 0) {
      const alertRows = alerts.map((a) => ({
        device_id: device.id,
        alert_type: a.type,
        severity: a.severity,
        message: a.message,
        stress_value: stressIndex,
      }))
      await supabase.from("alerts").insert(alertRows)
    }

    // Minimal response to save ESP8266 buffer space
    return jsonResponse({ ok: 1, si: stressIndex, a: alerts.length })
  } catch {
    return jsonResponse({ ok: 0, e: "Server error" }, 500)
  }
}
