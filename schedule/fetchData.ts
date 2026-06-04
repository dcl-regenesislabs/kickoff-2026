import { engine } from "@dcl/sdk/ecs"
import { saveFullScheduleData, scrollToClosestEvent } from "./schedulePanel"
import { dateFromGoogle, sortEvents } from "./helperFunctions"

let intervalSeconds: number
let runningGetEvents = false
let getEventsTimer = 0
let systemStarted = false

const API_URL =
  "https://web3.career/api/v1?token=tVjW5Nm2sjqkwi9LTS6i29AdWnRc2TmP&limit=50&show_description=false"

export function initScheduleDownload(fetchIntervalSeconds = 30) {
  intervalSeconds = fetchIntervalSeconds
  getEventsTimer = fetchIntervalSeconds // arranca forzado el primer ciclo

  console.log("Setting jobs data download every", intervalSeconds, "seconds")

  if (systemStarted) return
  systemStarted = true
  engine.addSystem(scheduleDownloadSystem)
}

export function scheduleDownloadSystem(dt: number) {
  getEventsTimer += dt
  if (getEventsTimer < intervalSeconds || runningGetEvents) return

  getEventsTimer = 0
  void downloadScheduleData()
}

export async function downloadScheduleData() {
  runningGetEvents = true

  try {
    const res = await fetch(API_URL)
    const data = await res.json()

    let jobsRaw: any[] = []

    // Caso 1: [meta, meta, [jobs]]
    if (Array.isArray(data[2])) {
      jobsRaw = data[2]
    }
    // Caso 2: [meta, meta, job, job, job...]
    else if (Array.isArray(data)) {
      jobsRaw = data.slice(2)
    }

    const jsonData = jobsRaw
      .filter((j) => j && typeof j === "object")
      .map((j) => {
        // usamos date_epoch si existe; si no, lo calculamos desde date
        const epoch =
          typeof j.date_epoch === "number"
            ? j.date_epoch
            : j.date
            ? Math.floor(Date.parse(j.date) / 1000)
            : 0

        const startEpoch = String(epoch)
        const startDate = dateFromGoogle(startEpoch)

        return {
          title: j.title || "",
          // por ahora usamos location como "descripcion" debajo del título
          description: (j.location || "").trim(),
          startDate,          // lo que ya espera el panel
          endDate: startDate, // mismo valor, no nos importa duración real
          coordX: 0,          // no se usan para jobs
          coordY: 0,
          color: "#ffffff",   // título blanco
          startEpoch,
          endEpoch: startEpoch,
          isVisible: true
        }
      })

    const sorted = sortEvents(jsonData)

    // guardamos en el componente y refrescamos el panel
    saveFullScheduleData(sorted)
    scrollToClosestEvent()
  } catch (e) {
    console.error("Error downloading jobs data: ", e)
  } finally {
    runningGetEvents = false
  }
}
