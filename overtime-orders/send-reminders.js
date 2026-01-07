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
 * Sends email notifications about pending overtime orders
 * - Production managers: pending non-logistics orders (awaiting pre-approval)
 * - Plant managers: pending logistics orders + pre_approved orders (awaiting final approval)
 */
async function sendOvertimeOrdersApprovalReminders() {
  let pendingForPreApproval = 0;
  let pendingForFinalApproval = 0;
  let productionManagerCount = 0;
  let plantManagerCount = 0;
  let emailsSent = 0;
  let emailErrors = 0;

  try {
    const coll = await dbc('overtime_orders');
    const usersColl = await dbc('users');

    // Query 1: Pending non-logistics → for production-manager (pre-approval)
    const pendingNonLogistics = await coll
      .find({ status: 'pending', department: { $ne: 'logistics' } })
      .toArray();

    // Query 2: Pending logistics + pre_approved → for plant-manager (final approval)
    const pendingLogistics = await coll
      .find({ status: 'pending', department: 'logistics' })
      .toArray();
    const preApprovedOrders = await coll.find({ status: 'pre_approved' }).toArray();

    pendingForPreApproval = pendingNonLogistics.length;
    pendingForFinalApproval = pendingLogistics.length + preApprovedOrders.length;

    const overtimeUrl = `${process.env.APP_URL}/overtime-orders`;

    // Send to production managers if there are pending non-logistics orders
    if (pendingForPreApproval > 0) {
      const productionManagers = await usersColl
        .find({ roles: { $in: ['production-manager'] } })
        .toArray();

      productionManagerCount = productionManagers.length;

      for (const manager of productionManagers) {
        if (!manager.email) continue;

        const subject = trilingualSubject(OVERTIME.subjects.pendingPreApproval);
        const messages = OVERTIME.messages.pendingPreApprovalCount(pendingForPreApproval);
        const html = createEmailContent(messages, overtimeUrl);

        try {
          if (!process.env.API_URL) {
            throw new Error('API environment variable is not defined');
          }

          await axios.post(`${process.env.API_URL}/mailer`, {
            to: manager.email,
            subject,
            html,
          });
          emailsSent++;
        } catch (error) {
          console.error(`Error sending email to production-manager:`, error);
          emailErrors++;
        }
      }
    }

    // Send to plant managers if there are pending logistics or pre_approved orders
    if (pendingForFinalApproval > 0) {
      const plantManagers = await usersColl
        .find({ roles: { $in: ['plant-manager'] } })
        .toArray();

      plantManagerCount = plantManagers.length;

      for (const manager of plantManagers) {
        if (!manager.email) continue;

        const subject = trilingualSubject(OVERTIME.subjects.pendingApproval);
        const messages = OVERTIME.messages.pendingLogisticsAndPreApprovedCount(
          pendingLogistics.length,
          preApprovedOrders.length
        );
        const html = createEmailContent(messages, overtimeUrl);

        try {
          if (!process.env.API_URL) {
            throw new Error('API environment variable is not defined');
          }

          await axios.post(`${process.env.API_URL}/mailer`, {
            to: manager.email,
            subject,
            html,
          });
          emailsSent++;
        } catch (error) {
          console.error(`Error sending email to plant-manager:`, error);
          emailErrors++;
        }
      }
    }
  } catch (error) {
    console.error('Error in sendOvertimeOrdersApprovalReminders:', error);
    throw error;
  }

  console.log(
    `sendOvertimeOrdersApprovalReminders -> success at ${new Date().toLocaleString()} | ` +
      `PreApproval: ${pendingForPreApproval} (PM: ${productionManagerCount}), ` +
      `FinalApproval: ${pendingForFinalApproval} (Plant: ${plantManagerCount}), ` +
      `Emails: ${emailsSent}, Errors: ${emailErrors}`
  );
}

/**
 * Checks for approved completed overtime orders and sends reminders
 * to responsible employees to add attendance lists
 */
async function sendOvertimeOrdersAttendanceReminders() {
  let totalCompletedTasks = 0;
  let emailsSent = 0;
  let emailErrors = 0;

  try {
    const coll = await dbc('overtime_orders');

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
        `sendOvertimeOrdersAttendanceReminders -> success at ${new Date().toLocaleString()} | Completed tasks: 0, Emails: 0`
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
        const overtimeUrl = `${process.env.APP_URL}/overtime-orders`;
        const html = createEmailContent(messages, overtimeUrl);

        await axios.post(`${process.env.API_URL}/mailer`, {
          to: employeeEmail,
          subject,
          html,
        });
        emailsSent++;
      } catch (error) {
        console.error(`Error sending completed task reminder email:`, error);
        emailErrors++;
      }
    }
  } catch (error) {
    console.error('Error in sendOvertimeOrdersAttendanceReminders:', error);
    throw error;
  }

  console.log(
    `sendOvertimeOrdersAttendanceReminders -> success at ${new Date().toLocaleString()} | Completed tasks: ${totalCompletedTasks}, Emails: ${emailsSent}, Errors: ${emailErrors}`
  );
}

export {
  sendOvertimeOrdersApprovalReminders,
  sendOvertimeOrdersAttendanceReminders,
};
