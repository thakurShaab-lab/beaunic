const { eq, and, inArray, asc } = require('drizzle-orm')
const db = require('../config/drizzle')
const { wlTimes } = require('../schema/wl-times')

// wl_times.status: 1=Active, 0=Inactive, 2=Deleted
const columns = { timeId: wlTimes.timeId, timeValue: wlTimes.timeValue, timeLabel: wlTimes.timeLabel }

// The times shown in the slot time picker, earliest first
const findActiveTimes = async () =>
    db.select(columns).from(wlTimes).where(eq(wlTimes.status, '1')).orderBy(asc(wlTimes.sortOrder), asc(wlTimes.timeValue))

// Active rows for the given IDs (a slot can only be given an active time)
const findActiveTimesByIds = async (timeIds) =>
    db.select(columns).from(wlTimes).where(and(inArray(wlTimes.timeId, timeIds), eq(wlTimes.status, '1')))

// Rows for the given "HH:MM:SS" values, whatever their status (to show a saved slot's time IDs)
const findTimesByValues = async (values) =>
    values.length ? db.select(columns).from(wlTimes).where(inArray(wlTimes.timeValue, values)) : []

module.exports = { findActiveTimes, findActiveTimesByIds, findTimesByValues }
