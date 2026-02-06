import axios from 'axios';
import { dbc } from '../lib/mongo.js';
import { buildHtml } from '../lib/email-helper.js';

async function sendIndividualOvertimeOrdersApprovalReminders() {
  let pendingForPlantManagers = 0;
  let plantManagerEmailsSent = 0;
  let emailErrors = 0;

  try {
    const coll = await dbc('individual_overtime_orders');
    const usersColl = await dbc('users');

    // Count orders awaiting plant manager approval (payout orders)
    const pendingPlantManagerCount = await coll.countDocuments({
      status: 'pending-plant-manager',
    });

    pendingForPlantManagers = pendingPlantManagerCount;

    const ordersUrl = `${process.env.APP_URL}/individual-overtime-orders`;

    // Send reminders to plant managers for payout orders
    if (pendingForPlantManagers > 0) {
      const plantManagers = await usersColl
        .find({ roles: { $in: ['plant-manager'] } })
        .toArray();

      for (const manager of plantManagers) {
        if (!manager.email) continue;

        const subject = 'Overtime orders awaiting approval (payout)';
        const message = `You have ${pendingForPlantManagers} overtime order${pendingForPlantManagers === 1 ? '' : 's'} (payout) awaiting your approval.`;
        const html = buildHtml(`<p>${message}</p>`, ordersUrl, 'Go to orders');

        try {
          await axios.post(`${process.env.API_URL}/mailer`, {
            to: manager.email,
            subject,
            html,
          });
          plantManagerEmailsSent++;
        } catch (error) {
          console.error(`Error sending email to plant-manager:`, error.message);
          emailErrors++;
        }
      }
    }
  } catch (error) {
    console.error('Error in sendIndividualOvertimeOrdersApprovalReminders:', error);
    throw error;
  }

  console.log(
    `sendIndividualOvertimeOrdersApprovalReminders -> success at ${new Date().toLocaleString()} | ` +
      `PlantMgr: ${pendingForPlantManagers} (emails: ${plantManagerEmailsSent}), ` +
      `Errors: ${emailErrors}`
  );
}

export { sendIndividualOvertimeOrdersApprovalReminders };
