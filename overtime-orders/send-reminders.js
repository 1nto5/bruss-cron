import axios from 'axios';
import { dbc } from '../lib/mongo.js';
import { buildHtml } from '../lib/email-helper.js';

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

    const pendingNonLogistics = await coll
      .find({ status: 'pending', department: { $ne: 'logistics' } })
      .toArray();

    const pendingLogistics = await coll
      .find({ status: 'pending', department: 'logistics' })
      .toArray();
    const preApprovedOrders = await coll.find({ status: 'pre_approved' }).toArray();

    pendingForPreApproval = pendingNonLogistics.length;
    pendingForFinalApproval = pendingLogistics.length + preApprovedOrders.length;

    const overtimeUrl = `${process.env.APP_URL}/overtime-orders`;

    // Send to production managers (English)
    if (pendingForPreApproval > 0) {
      const productionManagers = await usersColl
        .find({ roles: { $in: ['production-manager'] } })
        .toArray();

      productionManagerCount = productionManagers.length;

      for (const manager of productionManagers) {
        if (!manager.email) continue;

        const subject = 'Overtime orders awaiting pre-approval';
        const message = `You have ${pendingForPreApproval} overtime order${pendingForPreApproval === 1 ? '' : 's'} awaiting pre-approval.`;
        const html = buildHtml(`<p>${message}</p>`, overtimeUrl, 'Go to orders');

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

    // Send to plant managers (English)
    if (pendingForFinalApproval > 0) {
      const plantManagers = await usersColl
        .find({ roles: { $in: ['plant-manager'] } })
        .toArray();

      plantManagerCount = plantManagers.length;

      for (const manager of plantManagers) {
        if (!manager.email) continue;

        const logisticsInfo = pendingLogistics.length > 0 ? ` (${pendingLogistics.length} logistics)` : '';
        const preApprovedInfo = preApprovedOrders.length > 0 ? ` (${preApprovedOrders.length} pre-approved)` : '';
        const subject = 'Pending production overtime work orders';
        const message = `You have ${pendingForFinalApproval} overtime order${pendingForFinalApproval === 1 ? '' : 's'} awaiting approval${logisticsInfo}${preApprovedInfo}.`;
        const html = buildHtml(`<p>${message}</p>`, overtimeUrl, 'Go to orders');

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

async function sendOvertimeOrdersAttendanceReminders() {
  let totalCompletedTasks = 0;
  let emailsSent = 0;
  let emailErrors = 0;

  try {
    const coll = await dbc('overtime_orders');

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

    const tasksByEmployee = new Map();
    for (const task of completedTasks) {
      const employeeEmail = task.responsibleEmployee;
      if (!tasksByEmployee.has(employeeEmail)) {
        tasksByEmployee.set(employeeEmail, []);
      }
      tasksByEmployee.get(employeeEmail).push(task);
    }

    const overtimeUrl = `${process.env.APP_URL}/overtime-orders`;

    // Send to employees (bilingual: Polish + English)
    for (const [employeeEmail, tasks] of tasksByEmployee) {
      try {
        const taskCount = tasks.length;
        const subject = 'Zbiorowe zlecenie pracy nadliczbowej oczekuje na dodanie listy obecności / Overtime order awaiting attendance list';
        const messagePL =
          taskCount === 1
            ? 'Zbiorowe zlecenie pracy nadliczbowej oczekuje na dodanie listy obecności.'
            : `${taskCount} zbiorowych zleceń pracy nadliczbowej oczekuje na dodanie listy obecności.`;
        const messageEN =
          taskCount === 1
            ? 'An overtime order is awaiting attendance list submission.'
            : `${taskCount} overtime orders are awaiting attendance list submission.`;
        const html = buildHtml(
          `<p>${messagePL}</p><hr style="border:none;border-top:1px solid #ddd;margin:16px 0;"/><p>${messageEN}</p>`,
          overtimeUrl,
          'Przejdź do zleceń / Go to orders'
        );

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
