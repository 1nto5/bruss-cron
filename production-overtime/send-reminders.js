import axios from 'axios';
import { dbc } from '../lib/mongo.js';
import { buildHtml } from '../lib/email-helper.js';

/**
 * Sends email notifications about pending production overtime requests
 * - Production managers: pending non-logistics orders (awaiting pre-approval)
 * - Plant managers: pending logistics orders + pre_approved orders (awaiting final approval)
 */
async function sendProductionOvertimeApprovalReminders() {
  let pendingForPreApproval = 0;
  let pendingForFinalApproval = 0;
  let productionManagerCount = 0;
  let plantManagerCount = 0;
  let emailsSent = 0;
  let emailErrors = 0;

  try {
    const coll = await dbc('production_overtime');
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

    const overtimeUrl = `${process.env.APP_URL}/production-overtime`;

    // Send to production managers if there are pending non-logistics orders
    if (pendingForPreApproval > 0) {
      const productionManagers = await usersColl
        .find({ roles: { $in: ['production-manager'] } })
        .toArray();

      productionManagerCount = productionManagers.length;

      for (const manager of productionManagers) {
        if (!manager.email) continue;

        const subject = 'Production overtime awaiting pre-approval';
        const message = `You have ${pendingForPreApproval} production overtime request${pendingForPreApproval === 1 ? '' : 's'} awaiting pre-approval.`;
        const html = buildHtml(`<p>${message}</p>`, overtimeUrl, 'Go to production overtime');

        try {
          await axios.post(`${process.env.API_URL}/mailer`, {
            to: manager.email,
            subject,
            html,
          });
          emailsSent++;
        } catch (error) {
          console.error(`Error sending email to production-manager:`, error.message);
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

        const subject = 'Production overtime awaiting approval';
        const message = `You have ${pendingLogistics.length} logistics request${pendingLogistics.length === 1 ? '' : 's'} and ${preApprovedOrders.length} pre-approved request${preApprovedOrders.length === 1 ? '' : 's'} awaiting final approval.`;
        const html = buildHtml(`<p>${message}</p>`, overtimeUrl, 'Go to production overtime');

        try {
          await axios.post(`${process.env.API_URL}/mailer`, {
            to: manager.email,
            subject,
            html,
          });
          emailsSent++;
        } catch (error) {
          console.error(`Error sending email to plant-manager:`, error.message);
          emailErrors++;
        }
      }
    }
  } catch (error) {
    console.error('Error in sendProductionOvertimeApprovalReminders:', error);
    throw error;
  }

  console.log(
    `sendProductionOvertimeApprovalReminders -> success at ${new Date().toLocaleString()} | ` +
      `PreApproval: ${pendingForPreApproval} (PM: ${productionManagerCount}), ` +
      `FinalApproval: ${pendingForFinalApproval} (Plant: ${plantManagerCount}), ` +
      `Emails: ${emailsSent}, Errors: ${emailErrors}`
  );
}

/**
 * Checks for approved completed production overtime tasks and sends reminders
 * to responsible employees to add attendance lists
 */
async function sendProductionOvertimeAttendanceReminders() {
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
        `sendProductionOvertimeAttendanceReminders -> success at ${new Date().toLocaleString()} | Completed tasks: 0, Emails: 0`
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

    const overtimeUrl = `${process.env.APP_URL}/production-overtime`;

    // Send reminder to each responsible employee
    for (const [employeeEmail, tasks] of tasksByEmployee) {
      try {
        const taskCount = tasks.length;
        const subject = 'Production overtime - attendance list reminder';
        const message = `You have ${taskCount} completed production overtime task${taskCount === 1 ? '' : 's'} that may need attendance list updates.`;
        const html = buildHtml(`<p>${message}</p>`, overtimeUrl, 'Go to production overtime');

        await axios.post(`${process.env.API_URL}/mailer`, {
          to: employeeEmail,
          subject,
          html,
        });
        emailsSent++;
      } catch (error) {
        console.error(`Error sending completed task reminder email:`, error.message);
        emailErrors++;
      }
    }
  } catch (error) {
    console.error('Error in sendProductionOvertimeAttendanceReminders:', error);
    throw error;
  }

  console.log(
    `sendProductionOvertimeAttendanceReminders -> success at ${new Date().toLocaleString()} | Completed tasks: ${totalCompletedTasks}, Emails: ${emailsSent}, Errors: ${emailErrors}`
  );
}

export {
  sendProductionOvertimeApprovalReminders,
  sendProductionOvertimeAttendanceReminders,
};

