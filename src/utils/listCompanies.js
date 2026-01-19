import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Company } from '../models/company.model.js';

dotenv.config();

async function listCompanies() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const companies = await Company.find({ 
      userType: { $in: ['company', 'admin'] },
      isActive: true 
    }).select('_id companyName email userType').limit(10);

    console.log(`Found ${companies.length} companies:\n`);
    
    companies.forEach((company, index) => {
      console.log(`${index + 1}. ${company.companyName}`);
      console.log(`   ID: ${company._id}`);
      console.log(`   Email: ${company.email}`);
      console.log(`   Type: ${company.userType}\n`);
    });

    if (companies.length > 0) {
      console.log(`\nTo test a specific company, run:`);
      console.log(`node src/utils/diagnose.js ${companies[0]._id}\n`);
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

listCompanies();
