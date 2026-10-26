import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple environment file loader without external dependencies
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const DEMO_EMAIL = process.env.DEMO_USER_EMAIL || 'demo@pathify.app';
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD;

if (!DEMO_PASSWORD) {
  console.error('Missing DEMO_USER_PASSWORD in environment. Please provide a secure password via DEMO_USER_PASSWORD in .env.local or process environment.');
  process.exit(1);
}

const DEMO_NAME = 'Adaeze Okonkwo';
const DEMO_COUNTRY = 'Nigeria';

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function provisionDemoUser() {
  console.log(`Checking connection to: ${supabaseUrl}`);

  // Test connectivity
  try {
    const { error: pingError } = await supabase.from('opportunities_cache').select('count', { count: 'exact', head: true });
    if (pingError) {
      console.warn('PostgREST ping warning:', pingError.message);
    } else {
      console.log('✓ Successfully connected to Supabase PostgREST.');
    }
  } catch (err) {
    console.error('Cannot reach Supabase:', (err as Error).message);
    console.error('Please verify that the Supabase project is active and that DNS resolves.');
    process.exit(1);
  }

  // 1. Check if user already exists
  console.log(`Checking for existing demo user: ${DEMO_EMAIL}`);
  const { data: userList, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error('Failed to list users via admin API:', listError.message);
    process.exit(1);
  }

  let demoUser = userList.users.find((u) => u.email === DEMO_EMAIL);

  if (!demoUser) {
    console.log(`Creating demo user: ${DEMO_EMAIL}...`);
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: {
        name: DEMO_NAME,
        country: DEMO_COUNTRY,
        account_type: 'individual',
      },
    });

    if (createError || !newUser.user) {
      console.error('Failed to create demo user:', createError?.message);
      process.exit(1);
    }
    demoUser = newUser.user;
    console.log(`✓ Created demo user with ID: ${demoUser.id}`);
  } else {
    console.log(`✓ Demo user already exists with ID: ${demoUser.id}`);
    // Ensure password is updated and email is confirmed
    await supabase.auth.admin.updateUserById(demoUser.id, {
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: {
        name: DEMO_NAME,
        country: DEMO_COUNTRY,
        account_type: 'individual',
      },
    });
    console.log(`✓ Updated demo user credentials & email confirmation.`);
  }

  // 2. Ensure profile exists and has full representative data
  console.log('Provisioning representative passport profile...');
  const demoProfileData = {
    id: demoUser.id,
    name: DEMO_NAME,
    role: 'Full Stack AI Engineer',
    country: DEMO_COUNTRY,
    account_type: 'individual',
    skills: ['TypeScript', 'Next.js', 'Python', 'Tailwind CSS', 'PostgreSQL', 'AI/ML APIs', 'React'],
    goals: ['Full-time Remote Role', 'AI Tech Lead', 'Open Source Contributor'],
    onboarding_completed: true,
    is_passport_public: true,
    metadata: {
      bio: 'Full-stack software engineer focused on building intelligent web applications, distributed systems, and modern AI tools.',
      experience_level: 'mid',
      domain: 'Software Engineering',
      education: {
        institution: 'University of Lagos',
        level: 'Bachelor of Science',
        field: 'Computer Science',
        graduationYear: '2023',
      },
      experience: [
        {
          id: 'exp-1',
          title: 'Software Engineer',
          company: 'PayTech Solutions',
          startDate: '2023-01',
          endDate: 'Present',
          current: true,
          description: 'Architecting scalable microservices, Next.js dashboard workflows, and integrating AI copilot systems.',
        },
      ],
      projects: [
        {
          id: 'proj-1',
          name: 'Pathify AI Intelligence',
          description: 'Automated opportunity search and real-time skill matching engine.',
          skills: ['TypeScript', 'Next.js', 'Supabase'],
          url: 'https://pathify.app',
        },
      ],
      certifications: [
        {
          id: 'cert-1',
          name: 'AWS Certified Solutions Architect',
          issuer: 'Amazon Web Services',
          year: '2024',
        },
      ],
      preferences: {
        workMode: ['remote', 'hybrid'],
        locations: ['Nigeria', 'Global / Remote', 'United Kingdom', 'Germany'],
        opportunityTypes: ['jobs_remote', 'fellowships', 'hackathons', 'grants'],
      },
      interests: ['Artificial Intelligence', 'Fintech', 'Developer Tooling'],
    },
  };

  let { error: profileError } = await supabase
    .from('user_profiles')
    .upsert(demoProfileData, { onConflict: 'id' });

  if (profileError && profileError.message.includes('column')) {
    console.warn('Full profile upsert failed due to unmigrated columns, falling back to base schema.sql columns...');
    const baseProfileData = {
      id: demoUser.id,
      name: DEMO_NAME,
      role: 'Full Stack AI Engineer',
      country: DEMO_COUNTRY,
      skills: ['TypeScript', 'Next.js', 'Python', 'Tailwind CSS', 'PostgreSQL', 'AI/ML APIs', 'React'],
      goals: ['Remote Job', 'Fellowship'],
    };
    const retry = await supabase.from('user_profiles').upsert(baseProfileData, { onConflict: 'id' });
    profileError = retry.error;
  }

  if (profileError) {
    console.error('Error upserting demo profile:', profileError.message);
  } else {
    console.log('✓ Successfully upserted representative demo profile.');
  }

  console.log('\n--- DEMO USER SETUP COMPLETE ---');
  console.log(`Email:    ${DEMO_EMAIL}`);
  console.log('Password: [configured via DEMO_USER_PASSWORD]');
  console.log('--------------------------------\n');
}

provisionDemoUser();
