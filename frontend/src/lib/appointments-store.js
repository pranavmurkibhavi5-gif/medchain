/**
 * Appointment API calls.
 *
 * Split from appointments.js so the encryption and date handling there depend
 * on nothing but the Web Crypto API and can be tested outside a browser.
 */
import { api } from "./api";
import { decryptReason, encryptReason } from "./appointments.js";

/**
 * Book a slot with a doctor.
 *
 * @param {{address: string, publicKey: string}} doctor
 * @param {string} whenLocal raw value from a datetime-local input
 */
export async function bookAppointment({ doctor, whenLocal, reason, keyPair, myAddress }) {
  const { reasonEnvelope, reasonKeys } = await encryptReason(reason, {
    myAddress,
    myPublicKey: keyPair.publicKey,
    doctor,
  });

  const { appointment } = await api.bookAppointment({
    doctorAddress: doctor.address,
    // Sent as an ISO instant so the server is never guessing at time zones.
    scheduledFor: new Date(whenLocal).toISOString(),
    reasonEnvelope,
    reasonKeys,
  });
  return appointment;
}

/** List appointments, decrypting the reason on each where one was shared. */
export async function listAppointments(keyPair) {
  const { appointments } = await api.myAppointments();

  return Promise.all(
    (appointments || []).map(async (a) => {
      if (!a.sealedReason || !a.reasonEnvelope) return { ...a, reason: "" };
      try {
        return { ...a, reason: await decryptReason(a.reasonEnvelope, a.sealedReason, keyPair.privateKey) };
      } catch (err) {
        // Not sealed for this wallet, or altered. Show the appointment without
        // inventing a reason for it.
        console.warn("[appointments] reason unreadable:", err.message);
        return { ...a, reason: "" };
      }
    })
  );
}

export const setStatus = (id, status, reply) => api.updateAppointment(id, { status, reply });
