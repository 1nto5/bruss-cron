import axios from 'axios';
import dotenv from 'dotenv';
import { dbc } from '../lib/mongo.js';
import {
  OVERTIME,
  trilingualSubject,
  trilingualHtml,
} from '../lib/email-translations.js';

dotenv.config();

// Helper function to create trilingual email content
function createEmailContent(messages, overtimeUrl) {
  return trilingualHtml(
    { PL: `<p>${messages.PL}</p>`, EN: `<p>${messages.EN}</p>`, DE: `<p>${messages.DE}</p>` },
    overtimeUrl,
    OVERTIME.buttons.goToOrders
  );
}

/**
 * Sends email notifications to plant managers about pending overtime requests
 */
async function sendOvertimeApprovalReminders() {
  let totalRequests = 0;
  let totalManagers = 0;
  let emailsSent = 0;
  let emailErrors = 0;

  try {
    const coll = await dbc('production_overtime');

    // Find pending overtime requests
    const pendingRequests = await coll.find({ status: 'pending' }).toArray();

    if (pendingRequests.length === 0) {
      console.log(
        `sendOvertimeApprovalReminders -> success at ${new Date().toLocaleString()} | Pending: 0, Emails: 0`
      );
      return;
    }

    totalRequests = pendingRequests.length;

    const usersColl = await dbc('users');

    // Find plant managers
    const plantManagers = await usersColl
      .find({ roles: { $in: ['plant-manager'] } })
      .toArray();

    if (plantManagers.length === 0) {
      console.log(
        `sendOvertimeApprovalReminders -> success at ${new Date().toLocaleString()} | Pending: ${totalRequests}, Managers: 0, Emails: 0`
      );
      return;
    }

    totalManagers = plantManagers.length;

    // Send email to each plant manager
    for (const manager of plantManagers) {
      if (!manager.email) {
        continue;
      }

      // Prepare trilingual email content with count and link
      const subject = trilingualSubject(OVERTIME.subjects.pendingApproval);
      const messages = OVERTIME.messages.pendingCount(pendingRequests.length);
      const overtimeUrl = `${process.env.APP_URL}/production-overtime`;
      const html = createEmailContent(messages, overtimeUrl);

      try {
        // Use the API to send email
        let apiUrlBase;
        if (!process.env.API_URL) {
          throw new Error('API environment variable is not defined');
        }
        apiUrlBase = process.env.API_URL;
        const apiUrl = new URL(`${apiUrlBase}/mailer`);
        apiUrl.searchParams.append('to', manager.email);
        apiUrl.searchParams.append('subject', subject);
        apiUrl.searchParams.append('html', html);

        await axios.get(apiUrl.toString());
        emailsSent++;
      } catch (error) {
        console.error(`Error sending email:`, error);
        emailErrors++;
      }
    }
  } catch (error) {
    console.error('Error in sendOvertimeNotifications:', error);
    throw error; // Re-throw to allow executeWithErrorNotification to handle it
  }

  console.log(
    `sendOvertimeApprovalReminders -> success at ${new Date().toLocaleString()} | Pending: ${totalRequests}, Managers: ${totalManagers}, Emails: ${emailsSent}, Errors: ${emailErrors}`
  );
}

/**
 * Checks for approved completed tasks and sends reminders to responsible employees
 * to add attendance lists
 */
async function sendCompletedTaskAttendanceReminders() {
  let totalCompletedTasks = 0;
  let emailsSent = 0;
  let emailErrors = 0;

  try {
    const coll = await dbc('production_overtime');

    // Find approved tasks that are completed but may need attendance list updates
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 59, 59, 999);

    const completedTasks = await coll
      .find({
        status: 'approved',
        responsibleEmployee: { $exists: true, $ne: null, $ne: '' },
        from: { $lte: yesterday },
        to: { $lte: yesterday },
      })
      .toArray();

    if (completedTasks.length === 0) {
      console.log(
        `sendCompletedTaskAttendanceReminders -> success at ${new Date().toLocaleString()} | Completed tasks: 0, Emails: 0`
      );
      return;
    }

    totalCompletedTasks = completedTasks.length;

    // Group tasks by responsible employee email to avoid duplicate emails
    const tasksByEmployee = new Map();

    for (const task of completedTasks) {
      const employeeEmail = task.responsibleEmployee;
      if (!tasksByEmployee.has(employeeEmail)) {
        tasksByEmployee.set(employeeEmail, []);
      }
      tasksByEmployee.get(employeeEmail).push(task);
    }

    // Send reminder to each responsible employee
    for (const [employeeEmail, tasks] of tasksByEmployee) {
      try {
        const subject = trilingualSubject(OVERTIME.subjects.attendanceReminder);
        const taskCount = tasks.length;
        const messages = OVERTIME.messages.attendanceCount(taskCount);
        const overtimeUrl = `${process.env.APP_URL}/production-overtime`;
        const html = createEmailContent(messages, overtimeUrl);

        // Send email using existing API
        const apiUrl = new URL(`${process.env.API_URL}/mailer`);
        apiUrl.searchParams.append('to', employeeEmail);
        apiUrl.searchParams.append('subject', subject);
        apiUrl.searchParams.append('html', html);

        await axios.get(apiUrl.toString());
        emailsSent++;
      } catch (error) {
        console.error(`Error sending completed task reminder email:`, error);
        emailErrors++;
      }
    }
  } catch (error) {
    console.error('Error in sendCompletedTaskAttendanceReminders:', error);
    throw error; // Re-throw to allow executeWithErrorNotification to handle it
  }

  console.log(
    `sendCompletedTaskAttendanceReminders -> success at ${new Date().toLocaleString()} | Completed tasks: ${totalCompletedTasks}, Emails: ${emailsSent}, Errors: ${emailErrors}`
  );
}

export {
  sendCompletedTaskAttendanceReminders,
  sendOvertimeApprovalReminders,
  sendOvertimeApprovalReminders as sendPendingOvertimeRequestsApprovalNotifications,
};

