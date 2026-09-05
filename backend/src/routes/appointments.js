/**
 * Appointments between a patient and a doctor.
 *
 * Off-chain by design. The smart contract governs custody of medical records
 * and is deployed and fixed; an appointment is coordination that needs to be
 * rescheduled and cancelled freely, and would gain nothing from being
 * immutable. Recording it on a public chain would also publish, permanently,
 * which specialist a given person is seeing.
 *
 * What is protected is the part that is actually clinical: the reason for the
 * visit arrives already encrypted and sealed to the patient and that one
 * doctor. The server stores who, when and the status - it has to, in order to
 * list them - but never learns why.
 *
 * Booking an appointment grants no access to records. That still requires the
 * usual on-chain request and approval.
 */
const express = require("express");
const { ethers } = require("ethers");

const store = require("../config/store");
const { requireAuth, requireRole, requireWallet } = require("../middleware/auth");

const router = express.Router();
const lc = (s) => (s || "").toLowerCase();

const MAX_MONTHS_AHEAD = 6;

/** Only the two people involved may see or change an appointment. */
function isParty(appt, address) {
  const me = lc(address);
  return lc(appt.patient) === me || lc(appt.doctor) === me;
}

/**
 * POST /api/appointments
 * A patient requests a slot with a doctor.
 */
router.post("/", requireAuth, requireRole("patient"), requireWallet, async (req, res, next) => {
  try {
    const { doctorAddress, scheduledFor, reasonEnvelope, reasonKeys } = req.body || {};

    if (!doctorAddress || !ethers.isAddress(doctorAddress)) {
      return res.status(400).json({ error: "A valid doctor address is required" });
    }

    const when = new Date(scheduledFor);
    if (Number.isNaN(when.getTime())) {
      return res.status(400).json({ error: "A valid date and time is required" });
    }
    if (when.getTime() < Date.now()) {
      return res.status(400).json({ error: "That time is in the past" });
    }
    const limit = new Date();
    limit.setMonth(limit.getMonth() + MAX_MONTHS_AHEAD);
    if (when > limit) {
      return res.status(400).json({ error: `Appointments can be booked up to ${MAX_MONTHS_AHEAD} months ahead` });
    }

    // A reason is optional, but if one is sent it must already be encrypted.
    if (reasonEnvelope && (typeof reasonEnvelope.ct !== "string" || typeof reasonEnvelope.iv !== "string")) {
      return res.status(400).json({ error: "The reason must be encrypted before upload" });
    }

    const doctor = await store.users.findByWallet(doctorAddress);
    if (!doctor || doctor.role !== "doctor") {
      return res.status(404).json({ error: "Doctor not found" });
    }
    if (doctor.active === false) {
      return res.status(409).json({ error: "That doctor is not accepting appointments" });
    }

    const me = lc(req.user.walletAddress);

    // Refuse a second live request for the same doctor at the same moment.
    const existing = await store.appointments.listFor(me, "patient");
    const clash = existing.find(
      (a) =>
        lc(a.doctor) === lc(doctorAddress) &&
        ["requested", "confirmed"].includes(a.status) &&
        new Date(a.scheduledFor).getTime() === when.getTime()
    );
    if (clash) return res.status(409).json({ error: "You already have that slot with this doctor" });

    const appt = await store.appointments.create({
      patient: me,
      doctor: lc(doctorAddress),
      patientName: req.user.name || "",
      doctorName: doctor.name || "",
      scheduledFor: when,
      reasonEnvelope: reasonEnvelope || null,
      reasonKeys: Array.isArray(reasonKeys)
        ? reasonKeys
            .filter((k) => k && k.forAddress && k.envelope)
            .map((k) => ({ forAddress: lc(k.forAddress), envelope: k.envelope }))
        : [],
    });

    await store.logs.add({
      action: "APPOINTMENT_REQUESTED",
      actor: me,
      actorRole: "patient",
      target: lc(doctorAddress),
      detail: `Appointment requested for ${when.toISOString()}`,
      ip: req.ip,
    });

    res.status(201).json({ appointment: appt });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/appointments/mine
 * Role-aware: a patient sees theirs, a doctor sees the ones booked with them.
 * Each row carries only the key sealed to the caller.
 */
router.get("/mine", requireAuth, requireWallet, async (req, res, next) => {
  try {
    const me = lc(req.user.walletAddress);
    const rows = await store.appointments.listFor(me, req.user.role);

    const appointments = rows.map((a) => {
      const mine = (a.reasonKeys || []).find((k) => lc(k.forAddress) === me);
      const { reasonKeys, ...rest } = a;
      return { ...rest, sealedReason: mine ? mine.envelope : null };
    });

    res.json({ appointments });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/appointments/:id
 * The doctor confirms or declines; either party cancels. Nothing else moves.
 */
router.patch("/:id", requireAuth, requireWallet, async (req, res, next) => {
  try {
    const { status, reply } = req.body || {};
    const appt = await store.appointments.findById(req.params.id);
    if (!appt) return res.status(404).json({ error: "Appointment not found" });

    const me = lc(req.user.walletAddress);
    if (!isParty(appt, me)) return res.status(403).json({ error: "Not your appointment" });

    const isDoctor = lc(appt.doctor) === me;
    const allowed = isDoctor
      ? ["confirmed", "declined", "completed", "cancelled"]
      : ["cancelled"];

    if (!allowed.includes(status)) {
      return res.status(400).json({
        error: isDoctor
          ? "A doctor can confirm, decline, complete or cancel"
          : "A patient can only cancel",
      });
    }
    if (["declined", "cancelled", "completed"].includes(appt.status)) {
      return res.status(409).json({ error: `This appointment is already ${appt.status}` });
    }

    const updated = await store.appointments.update(appt.id, {
      status,
      // The doctor's short note back. Not clinical - "clinic closed that day",
      // "please come fasting" - so it stays readable for both parties.
      reply: isDoctor && typeof reply === "string" ? reply.slice(0, 300) : appt.reply,
    });

    await store.logs.add({
      action: `APPOINTMENT_${status.toUpperCase()}`,
      actor: me,
      actorRole: req.user.role,
      target: isDoctor ? lc(appt.patient) : lc(appt.doctor),
      detail: `Appointment on ${new Date(appt.scheduledFor).toISOString()} ${status}`,
      ip: req.ip,
    });

    res.json({ appointment: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
