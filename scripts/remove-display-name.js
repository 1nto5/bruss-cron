// One-off script to remove displayName from all user documents.
// Run via mongosh against the target database:
//   mongosh "mongodb://..." --file scripts/remove-display-name.js

const result = db.users.updateMany(
  { displayName: { $exists: true } },
  { $unset: { displayName: '' } },
);

print(
  `Removed displayName from ${result.modifiedCount} of ${result.matchedCount} matched documents.`,
);
