import { dbc } from '../lib/mongo.js';
const LdapClientModule = await import('ldapjs-client');
const LdapClient = LdapClientModule.default || LdapClientModule;

export async function syncLdapUsers() {
  const ldapClient = new LdapClient({
    url: process.env.LDAP,
    timeout: 30000,
    connectTimeout: 10000,
  });

  // Initialize counters
  let addedUsers = 0;
  let deletedUsers = 0;
  let processedUsers = 0;

  try {
    // Bind to LDAP server
    await ldapClient.bind(process.env.LDAP_DN, process.env.LDAP_PASS);

    const usersCollection = await dbc('users');

    // Keep track of active LDAP users for cleanup later
    const activeEmails = new Set();

    // Single search with PL filter
    const options = {
      filter: '(&(mail=*)(c=PL))',
      scope: 'sub',
      attributes: ['mail', 'dn', 'cn'],
    };

    const searchResults = await ldapClient.search(
      process.env.LDAP_BASE_DN,
      options
    );

    processedUsers = searchResults.length;

    // Process search results - collect bulk operations
    const bulkOps = [];
    for (const ldapUser of searchResults) {
      if (ldapUser.mail) {
        const email = Array.isArray(ldapUser.mail)
          ? ldapUser.mail[0].toLowerCase()
          : ldapUser.mail.toLowerCase();

        activeEmails.add(email);

        bulkOps.push({
          updateOne: {
            filter: { email },
            update: {
              $set: { lastSyncedAt: new Date(), displayName: ldapUser.cn || email },
              $setOnInsert: { email, roles: ['user'] },
            },
            upsert: true,
          },
        });
      }
    }

    // Execute bulk operations
    if (bulkOps.length > 0) {
      const result = await usersCollection.bulkWrite(bulkOps, { ordered: false });
      addedUsers = result.upsertedCount;
    }

    // Remove users who no longer exist in LDAP (single atomic query)
    if (activeEmails.size > 0) {
      try {
        const deleteResult = await usersCollection.deleteMany({
          email: { $nin: Array.from(activeEmails) },
          source: { $ne: 'manual' }, // preserve manual users
        });
        deletedUsers = deleteResult.deletedCount;
      } catch (cleanupError) {
        console.error('Error during cleanup of inactive users:', cleanupError);
        throw cleanupError; // Re-throw to allow executeWithErrorNotification to handle it
      }
    }
  } catch (error) {
    console.error('Error during syncing LDAP users:', error);
    throw error; // Re-throw to allow executeWithErrorNotification to handle it
  } finally {
    // Always close the connection properly
    try {
      await ldapClient.unbind();
    } catch (unbindError) {
      // Check if this is just a "Connection closed" error which can be ignored
      if (unbindError.lde_message !== 'Connection closed') {
        console.error(
          'Unexpected error while unbinding LDAP connection:',
          unbindError
        );
      }
    }
    console.log(
      `syncLdapUsers -> success at ${new Date().toLocaleString()} | Processed: ${processedUsers}, Added: ${addedUsers}, Deleted: ${deletedUsers}`
    );
  }
}

