const { ipcRenderer } = require("electron")
const moment = require("moment")

// DOM Elements
const currentDateEl = document.getElementById("current-date")
const currentTimeEl = document.getElementById("current-time")
const siteNameEl = document.getElementById("site-name")
const logsContainerEl = document.getElementById("logs-container")
const btnStopMeasure = document.getElementById("btn-stop-measure")
const btnStopMonitoring = document.getElementById("btn-stop-monitoring")
const btnHideLogs = document.getElementById("btn-hide-logs")
const btnViewData = document.getElementById("btn-view-data")
const btnClearLogs = document.getElementById("btn-clear-logs")
const btnMinimize = document.getElementById("btn-minimize")
const btnMaximize = document.getElementById("btn-maximize")
const btnClose = document.getElementById("btn-close")
const btnCalibration = document.getElementById("btn-calibration")

// Sensor value elements
const chlorineValueEl = document.getElementById("chlorine-value")
const phValueEl = document.getElementById("ph-value")
const temperatureValueEl = document.getElementById("temperature-value")
const flowValueEl = document.getElementById("flow-value")

// Status elements
const phStatusEl = document.getElementById("ph-status")
const cloStatusEl = document.getElementById("clo-status")
const debitStatusEl = document.getElementById("debit-status")
const monitoringStatusEl = document.getElementById("monitoring-status")
const modbusStatusEl = document.getElementById("modbus-status")
const klhkStatusEl = document.getElementById("klhk-status")

// Modal elements
const settingsModal = document.getElementById("settings-modal")
const btnCancelSettings = document.getElementById("btn-cancel-settings")
const btnSaveSettings = document.getElementById("btn-save-settings")
const sensorConfigModal = document.getElementById("sensor-config-modal")
const btnCancelSensorConfig = document.getElementById("btn-cancel-sensor-config")
const btnSaveSensorConfig = document.getElementById("btn-save-sensor-config")
const btnAddSensor = document.getElementById("btn-add-sensor")
const editSensorModal = document.getElementById("edit-sensor-modal")
const btnCancelEditSensor = document.getElementById("btn-cancel-edit-sensor")
const btnSaveEditSensor = document.getElementById("btn-save-edit-sensor")
const sensorTableBody = document.getElementById("sensor-table-body")

// Form elements
const portInput = document.getElementById("port")
const baudRateSelect = document.getElementById("baud-rate")
const dataBitsSelect = document.getElementById("data-bits")
const stopBitsSelect = document.getElementById("stop-bits")
const paritySelect = document.getElementById("parity")
const slaveIdInput = document.getElementById("slave-id")
const siteNameInput = document.getElementById("site-name-input")
const monitoringIntervalInput = document.getElementById("monitoring-interval")

// Sensor form elements
const sensorNameInput = document.getElementById("sensor-name")
const sensorAddressInput = document.getElementById("sensor-address")
const sensorLengthInput = document.getElementById("sensor-length")
const sensorDataTypeSelect = document.getElementById("sensor-data-type")
const sensorUnitInput = document.getElementById("sensor-unit")
const sensorIndexInput = document.getElementById("sensor-index")
const editSensorTitle = document.getElementById("edit-sensor-title")

// Application state
let isConnected = false
let isMonitoring = false
let isLogsVisible = true
const sensors = [
  { name: "CHLORINE", address: 0, length: 2, dataType: "float", unit: "ppm" },
  { name: "PH", address: 2, length: 2, dataType: "float", unit: "pH" },
  { name: "TEMPERATURE", address: 4, length: 2, dataType: "float", unit: "°C" },
  { name: "FLOW", address: 6, length: 2, dataType: "float", unit: "m³/menit" },
]

// Initialize the application
function init() {
  updateDateTime()
  setInterval(updateDateTime, 1000)

  // Show settings modal on startup
  showSettingsModal()

  // Load logs
  loadLogs()

  // Update site name
  siteNameEl.textContent = siteNameInput.value

  // Render sensor table
  renderSensorTable()

  // Set up event listeners
  setupEventListeners()
}

// Update date and time
function updateDateTime() {
  const now = moment()
  currentDateEl.textContent = now.format("DD MMM YYYY")
  currentTimeEl.textContent = now.format("HH:mm:ss")
}

// Load logs from main process
async function loadLogs() {
  const logs = await ipcRenderer.invoke("get-logs")
  renderLogs(logs)
}

// Render logs
function renderLogs(logs) {
  logsContainerEl.innerHTML = ""
  logs.forEach((log) => {
    const logEl = document.createElement("div")
    logEl.textContent = log
    logsContainerEl.appendChild(logEl)
  })
  logsContainerEl.scrollTop = logsContainerEl.scrollHeight
}

// Add a log message
function addLogMessage(message) {
  const logEl = document.createElement("div")
  logEl.textContent = message
  logsContainerEl.appendChild(logEl)
  logsContainerEl.scrollTop = logsContainerEl.scrollHeight
}

// Connect to Modbus
async function connectModbus() {
  const config = {
    port: portInput.value,
    baudRate: Number.parseInt(baudRateSelect.value),
    dataBits: Number.parseInt(dataBitsSelect.value),
    stopBits: Number.parseInt(stopBitsSelect.value),
    parity: paritySelect.value,
    slaveId: Number.parseInt(slaveIdInput.value),
  }

  try {
    const result = await ipcRenderer.invoke("connect-modbus", config)
    if (result.success) {
      isConnected = true
      modbusStatusEl.textContent = "Active"
      modbusStatusEl.previousElementSibling.classList.remove("bg-red-500")
      modbusStatusEl.previousElementSibling.classList.add("bg-green-500")
      siteNameEl.textContent = siteNameInput.value
      addLogMessage(`Connected to ${config.port} at ${config.baudRate} baud`)
    } else {
      addLogMessage(`Connection failed: ${result.message}`)
    }
    return result.success
  } catch (error) {
    addLogMessage(`Connection error: ${error.message}`)
    return false
  }
}

// Disconnect from Modbus
async function disconnectModbus() {
  try {
    const result = await ipcRenderer.invoke("disconnect-modbus")
    if (result.success) {
      isConnected = false
      modbusStatusEl.textContent = "Inactive"
      modbusStatusEl.previousElementSibling.classList.remove("bg-green-500")
      modbusStatusEl.previousElementSibling.classList.add("bg-red-500")
      addLogMessage("Disconnected from Modbus RTU")
    } else {
      addLogMessage(`Disconnection failed: ${result.message}`)
    }
    return result.success
  } catch (error) {
    addLogMessage(`Disconnection error: ${error.message}`)
    return false
  }
}

// Start monitoring
async function startMonitoring() {
  if (!isConnected) {
    addLogMessage("Cannot start monitoring: Not connected to Modbus")
    return false
  }

  const config = {
    sensors: sensors,
    interval: Number.parseInt(monitoringIntervalInput.value),
  }

  try {
    const result = await ipcRenderer.invoke("start-monitoring", config)
    if (result.success) {
      isMonitoring = true
      monitoringStatusEl.textContent = "Active"
      btnStopMonitoring.querySelector("span").classList.remove("bg-red-500")
      btnStopMonitoring.querySelector("span").classList.add("bg-green-500")
      addLogMessage(`Started monitoring with interval ${config.interval}ms`)
    } else {
      addLogMessage(`Failed to start monitoring: ${result.message}`)
    }
    return result.success
  } catch (error) {
    addLogMessage(`Start monitoring error: ${error.message}`)
    return false
  }
}

// Stop monitoring
async function stopMonitoring() {
  try {
    const result = await ipcRenderer.invoke("stop-monitoring")
    if (result.success) {
      isMonitoring = false
      monitoringStatusEl.textContent = "Inactive"
      btnStopMonitoring.querySelector("span").classList.remove("bg-green-500")
      btnStopMonitoring.querySelector("span").classList.add("bg-red-500")
      addLogMessage("Monitoring stopped")
    } else {
      addLogMessage(`Failed to stop monitoring: ${result.message}`)
    }
    return result.success
  } catch (error) {
    addLogMessage(`Stop monitoring error: ${error.message}`)
    return false
  }
}

// Clear logs
async function clearLogs() {
  try {
    await ipcRenderer.invoke("clear-logs")
    logsContainerEl.innerHTML = ""
    addLogMessage("Logs cleared")
  } catch (error) {
    console.error("Error clearing logs:", error)
  }
}

// Toggle logs visibility
function toggleLogs() {
  const logsPanel = document.querySelector("#logs-container").parentElement
  isLogsVisible = !isLogsVisible

  if (isLogsVisible) {
    logsPanel.classList.remove("hidden")
    btnHideLogs.textContent = "Hide Logs"
  } else {
    logsPanel.classList.add("hidden")
    btnHideLogs.textContent = "Show Logs"
  }
}

// Show settings modal
function showSettingsModal() {
  settingsModal.classList.remove("hidden")
}

// Hide settings modal
function hideSettingsModal() {
  settingsModal.classList.add("hidden")
}

// Show sensor configuration modal
function showSensorConfigModal() {
  renderSensorTable()
  sensorConfigModal.classList.remove("hidden")
}

// Hide sensor configuration modal
function hideSensorConfigModal() {
  sensorConfigModal.classList.add("hidden")
}

// Show edit sensor modal
function showEditSensorModal(index = -1) {
  if (index >= 0) {
    // Edit existing sensor
    const sensor = sensors[index]
    sensorNameInput.value = sensor.name
    sensorAddressInput.value = sensor.address
    sensorLengthInput.value = sensor.length
    sensorDataTypeSelect.value = sensor.dataType
    sensorUnitInput.value = sensor.unit
    sensorIndexInput.value = index
    editSensorTitle.textContent = "Edit Sensor"
  } else {
    // Add new sensor
    sensorNameInput.value = ""
    sensorAddressInput.value = "0"
    sensorLengthInput.value = "2"
    sensorDataTypeSelect.value = "float"
    sensorUnitInput.value = ""
    sensorIndexInput.value = "-1"
    editSensorTitle.textContent = "Add Sensor"
  }

  editSensorModal.classList.remove("hidden")
}

// Hide edit sensor modal
function hideEditSensorModal() {
  editSensorModal.classList.add("hidden")
}

// Save sensor
function saveSensor() {
  const name = sensorNameInput.value.trim()
  const address = Number.parseInt(sensorAddressInput.value)
  const length = Number.parseInt(sensorLengthInput.value)
  const dataType = sensorDataTypeSelect.value
  const unit = sensorUnitInput.value.trim()
  const index = Number.parseInt(sensorIndexInput.value)

  if (!name) {
    alert("Sensor name is required")
    return
  }

  const sensor = {
    name,
    address,
    length,
    dataType,
    unit,
  }

  if (index >= 0) {
    // Update existing sensor
    sensors[index] = sensor
  } else {
    // Add new sensor
    sensors.push(sensor)
  }

  renderSensorTable()
  hideEditSensorModal()
}

// Delete sensor
function deleteSensor(index) {
  if (confirm("Are you sure you want to delete this sensor?")) {
    sensors.splice(index, 1)
    renderSensorTable()
  }
}

// Render sensor table
function renderSensorTable() {
  sensorTableBody.innerHTML = ""

  sensors.forEach((sensor, index) => {
    const row = document.createElement("tr")

    const nameCell = document.createElement("td")
    nameCell.className = "px-6 py-4 whitespace-nowrap"
    nameCell.textContent = sensor.name

    const addressCell = document.createElement("td")
    addressCell.className = "px-6 py-4 whitespace-nowrap"
    addressCell.textContent = sensor.address

    const lengthCell = document.createElement("td")
    lengthCell.className = "px-6 py-4 whitespace-nowrap"
    lengthCell.textContent = sensor.length

    const dataTypeCell = document.createElement("td")
    dataTypeCell.className = "px-6 py-4 whitespace-nowrap"
    dataTypeCell.textContent = sensor.dataType

    const unitCell = document.createElement("td")
    unitCell.className = "px-6 py-4 whitespace-nowrap"
    unitCell.textContent = sensor.unit

    const actionsCell = document.createElement("td")
    actionsCell.className = "px-6 py-4 whitespace-nowrap text-right text-sm font-medium"

    const editButton = document.createElement("button")
    editButton.className = "text-indigo-600 hover:text-indigo-900 mr-2"
    editButton.textContent = "Edit"
    editButton.addEventListener("click", () => showEditSensorModal(index))

    const deleteButton = document.createElement("button")
    deleteButton.className = "text-red-600 hover:text-red-900"
    deleteButton.textContent = "Delete"
    deleteButton.addEventListener("click", () => deleteSensor(index))

    actionsCell.appendChild(editButton)
    actionsCell.appendChild(deleteButton)

    row.appendChild(nameCell)
    row.appendChild(addressCell)
    row.appendChild(lengthCell)
    row.appendChild(dataTypeCell)
    row.appendChild(unitCell)
    row.appendChild(actionsCell)

    sensorTableBody.appendChild(row)
  })
}

// Update sensor values
function updateSensorValues(readings) {
  for (const [name, data] of Object.entries(readings)) {
    if (name === "CHLORINE" && data.value !== null) {
      chlorineValueEl.textContent = data.value.toFixed(2)
    } else if (name === "PH" && data.value !== null) {
      phValueEl.textContent = data.value.toFixed(2)
    } else if (name === "TEMPERATURE" && data.value !== null) {
      temperatureValueEl.textContent = data.value.toFixed(2)
    } else if (name === "FLOW" && data.value !== null) {
      flowValueEl.textContent = data.value.toFixed(2)
    }
  }
}

// Setup event listeners
function setupEventListeners() {
  // Window control buttons
  btnMinimize.addEventListener("click", () => {
    ipcRenderer.send("minimize-window")
  })

  btnMaximize.addEventListener("click", () => {
    ipcRenderer.send("maximize-window")
  })

  btnClose.addEventListener("click", () => {
    ipcRenderer.send("close-window")
  })

  // Control buttons
  btnStopMeasure.addEventListener("click", async () => {
    if (isConnected) {
      await disconnectModbus()
    } else {
      showSettingsModal()
    }
  })

  btnStopMonitoring.addEventListener("click", async () => {
    if (isMonitoring) {
      await stopMonitoring()
    } else {
      await startMonitoring()
    }
  })

  btnHideLogs.addEventListener("click", toggleLogs)

  btnViewData.addEventListener("click", () => {
    // TODO: Implement data viewing functionality
    addLogMessage("View Data functionality not implemented yet")
  })

  btnClearLogs.addEventListener("click", clearLogs)

  btnCalibration.addEventListener("click", () => {
    showSensorConfigModal()
  })

  // Settings modal
  btnCancelSettings.addEventListener("click", hideSettingsModal)

  btnSaveSettings.addEventListener("click", async () => {
    const success = await connectModbus()
    if (success) {
      hideSettingsModal()
    }
  })

  // Sensor config modal
  btnCancelSensorConfig.addEventListener("click", hideSensorConfigModal)

  btnSaveSensorConfig.addEventListener("click", () => {
    hideSensorConfigModal()
  })

  btnAddSensor.addEventListener("click", () => {
    showEditSensorModal()
  })

  // Edit sensor modal
  btnCancelEditSensor.addEventListener("click", hideEditSensorModal)

  btnSaveEditSensor.addEventListener("click", saveSensor)

  // IPC events
  ipcRenderer.on("log-update", (event, message) => {
    addLogMessage(message)
  })

  ipcRenderer.on("monitoring-data", (event, readings) => {
    updateSensorValues(readings)
  })

  ipcRenderer.on("monitoring-error", (event, message) => {
    addLogMessage(`Monitoring error: ${message}`)
  })
}

// Initialize the application
init()

