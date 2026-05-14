import "dotenv/config"
import express from "express"
import { validateConfig, PORT } from "./config.js"
import { requestLogger } from "./middleware/logging.js"
import { errorHandler } from "./middleware/errorHandler.js"
import authorizeRouter from "./routes/authorize.js"
import callbackRouter from "./routes/callback.js"
import validateRouter from "./routes/validate.js"

validateConfig()

const app = express()

app.use(express.json())
app.use(requestLogger)

app.use("/", authorizeRouter)
app.use("/", callbackRouter)
app.use("/", validateRouter)

app.use(errorHandler)

app.listen(PORT, "127.0.0.1", () => {
  console.log(`OAuth broker listening on 127.0.0.1:${ PORT }`)
})
