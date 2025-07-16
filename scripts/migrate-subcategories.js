const mongoose = require('mongoose');
const Subcategorie = require('../model/subcategorie.model'); // adjust the path if different

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/ecommerce', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ Connected to MongoDB');
  migrateSubcategories();
}).catch(err => {
  console.error('❌ DB connection failed:', err.message);
});

async function migrateSubcategories() {
  try {
    const subs = await Subcategorie.find({ aubcategorie: { $exists: true } });

    let migratedCount = 0;
    let skippedCount = 0;

    for (const sub of subs) {
      if (sub.aubcategorie) {
        sub.categorie = sub.aubcategorie;
        sub.aubcategorie = undefined;

        try {
          await sub.save();
          migratedCount++;
        } catch (saveErr) {
          console.error(`❌ Failed to save subcategorie ${sub._id}:`, saveErr.message);
        }
      } else {
        skippedCount++;
        console.warn(`⚠️ Skipped subcategorie ${sub._id} (aubcategorie missing)`);
      }
    }

    console.log(`✅ Migration complete. Migrated: ${migratedCount}, Skipped: ${skippedCount}`);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    mongoose.connection.close();
  }
}
