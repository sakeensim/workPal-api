const express = require("express")
const router = express.Router()

const locationController = require("../controllers/location-controller")
const { authenticate } = require("../middleware/authenticate")
const adminAuth = require("../middleware/adminAuth")

router.post(
  "/admin/checkin-location",
  authenticate,
  adminAuth,
  locationController.createLocation
)

router.get(
  "/checkin-location",
  authenticate,
  locationController.getActiveLocation
)

module.exports = router