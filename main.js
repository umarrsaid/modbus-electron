const { app, BrowserWindow, ipcMain } = require("electron")
const path = require("path")
const ModbusRTU = require("modbus-serial")
const client = new ModbusRTU()

let mainWindow
let isConnected = false
let monitoringInterval = null
let logMessages = []

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    icon: path.join(__dirname, "assets/icon.png"),
  })

  mainWindow.loadFile("index.html")

  // Open DevTools in development
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

// Connect to Modbus RTU
ipcMain.handle("connect-modbus", async (event, config) => {
  try {
    if (isConnected) {
      await client.close()
      isConnected = false
    }

    // Connect to serial port
    await client.connectRTUBuffered(config.port, {
      baudRate: config.baudRate,
      dataBits: config.dataBits,
      stopBits: config.stopBits,
      parity: config.parity,
    })

    // Set the slave ID
    client.setID(config.slaveId)

    isConnected = true
    addLogMessage(`Connected to ${config.port} at ${config.baudRate} baud`)
    return { success: true, message: "Connected successfully" }
  } catch (error) {
    addLogMessage(`Connection error: ${error.message}`)
    return { success: false, message: error.message }
  }
})

// Disconnect from Modbus RTU
ipcMain.handle("disconnect-modbus", async () => {
  try {
    if (isConnected) {
      await client.close()
      isConnected = false
      addLogMessage("Disconnected from Modbus RTU")
      return { success: true, message: "Disconnected successfully" }
    }
    return { success: true, message: "Already disconnected" }
  } catch (error) {
    addLogMessage(`Disconnection error: ${error.message}`)
    return { success: false, message: error.message }
  }
})

// Read Modbus registers
ipcMain.handle("read-registers", async (event, { address, length, type }) => {
  try {
    if (!isConnected) {
      return { success: false, message: "Not connected to Modbus" }
    }

    let data
    switch (type) {
      case "holding":
        data = await client.readHoldingRegisters(address, length)
        break
      case "input":
        data = await client.readInputRegisters(address, length)
        break
      case "coil":
        data = await client.readCoils(address, length)
        break
      case "discrete":
        data = await client.readDiscreteInputs(address, length)
        break
      default:
        return { success: false, message: "Invalid register type" }
    }

    addLogMessage(`Read ${type} registers at address ${address}: ${JSON.stringify(data.data)}`)
    return { success: true, data: data.data }
  } catch (error) {
    addLogMessage(`Read error: ${error.message}`)
    return { success: false, message: error.message }
  }
})

// Write to Modbus registers
ipcMain.handle("write-register", async (event, { address, value, type }) => {
  try {
    if (!isConnected) {
      return { success: false, message: "Not connected to Modbus" }
    }

    let result
    switch (type) {
      case "holding":
        result = await client.writeRegister(address, value)
        break
      case "coil":
        result = await client.writeCoil(address, value === 1 || value === true)
        break
      case "multiple-holding":
        if (!Array.isArray(value)) {
          return { success: false, message: "Value must be an array for multiple registers" }
        }
        result = await client.writeRegisters(address, value)
        break
      case "multiple-coil":
        if (!Array.isArray(value)) {
          return { success: false, message: "Value must be an array for multiple coils" }
        }
        result = await client.writeCoils(address, value)
        break
      default:
        return { success: false, message: "Invalid register type" }
    }

    addLogMessage(`Wrote to ${type} at address ${address}: ${JSON.stringify(value)}`)
    return { success: true, data: result }
  } catch (error) {
    addLogMessage(`Write error: ${error.message}`)
    return { success: false, message: error.message }
  }
})

// Start monitoring
ipcMain.handle("start-monitoring", async (event, config) => {
  try {
    if (!isConnected) {
      return { success: false, message: "Not connected to Modbus" }
    }

    if (monitoringInterval) {
      clearInterval(monitoringInterval)
    }

    // Store the monitoring configuration
    const monitoringConfig = config

    // Start the monitoring interval
    monitoringInterval = setInterval(async () => {
      try {
        const readings = {}

        // Read each configured register
        for (const sensor of monitoringConfig.sensors) {
          try {
            const result = await client.readHoldingRegisters(sensor.address, sensor.length)

            // Process the data based on the data type
            let value
            if (sensor.dataType === "float") {
              // Convert two registers to a float (assuming IEEE-754 format)
              const buf = Buffer.alloc(4)
              buf.writeUInt16BE(result.data[0], 0)
              buf.writeUInt16BE(result.data[1], 2)
              value = buf.readFloatBE(0)
            } else if (sensor.dataType === "int16") {
              value = result.data[0]
            } else if (sensor.dataType === "int32") {
              const buf = Buffer.alloc(4)
              buf.writeUInt16BE(result.data[0], 0)
              buf.writeUInt16BE(result.data[1], 2)
              value = buf.readInt32BE(0)
            } else {
              value = result.data[0]
            }

            readings[sensor.name] = {
              value: Number.parseFloat(value.toFixed(2)),
              unit: sensor.unit,
            }
          } catch (error) {
            addLogMessage(`Error reading ${sensor.name}: ${error.message}`)
            readings[sensor.name] = { value: null, unit: sensor.unit, error: error.message }
          }
        }

        // Send the readings to the renderer
        mainWindow.webContents.send("monitoring-data", readings)
      } catch (error) {
        addLogMessage(`Monitoring error: ${error.message}`)
        mainWindow.webContents.send("monitoring-error", error.message)
      }
    }, monitoringConfig.interval)

    addLogMessage(`Started monitoring with interval ${config.interval}ms`)
    return { success: true, message: "Monitoring started" }
  } catch (error) {
    addLogMessage(`Start monitoring error: ${error.message}`)
    return { success: false, message: error.message }
  }
})

// Stop monitoring
ipcMain.handle("stop-monitoring", async () => {
  try {
    if (monitoringInterval) {
      clearInterval(monitoringInterval)
      monitoringInterval = null
      addLogMessage("Monitoring stopped")
      return { success: true, message: "Monitoring stopped" }
    }
    return { success: true, message: "Monitoring was not running" }
  } catch (error) {
    addLogMessage(`Stop monitoring error: ${error.message}`)
    return { success: false, message: error.message }
  }
})

// Get logs
ipcMain.handle("get-logs", () => {
  return logMessages
})

// Clear logs
ipcMain.handle("clear-logs", () => {
  logMessages = []
  return { success: true }
})

function addLogMessage(message) {
  const timestamp = new Date().toISOString()
  const logEntry = `${timestamp}: ${message}`
  logMessages.push(logEntry)

  // Keep only the last 100 messages
  if (logMessages.length > 100) {
    logMessages.shift()
  }

  // Send to renderer if window exists
  if (mainWindow) {
    mainWindow.webContents.send("log-update", logEntry)
  }
}

