// AUTO-GENERATED — DO NOT EDIT BY HAND.
//
// Source:    actor/src/skills/taxonomy.json
// Generator: frontend/scripts/build-taxonomy.mjs
// Regenerate: npm run taxonomy
// Verify:     npm run taxonomy:check
//
// The Python actor and this module are projections of ONE taxonomy. Editing
// this file by hand will be reverted by the next `npm run taxonomy` and will
// silently desynchronise match scoring from what the actor extracts.

export type SkillCategory = 'tech' | 'soft' | 'domain' | 'tool';

export interface TaxonomySkill {
  readonly canonical: string;
  readonly category: SkillCategory;
  readonly weight: number;
  readonly aliases: readonly string[];
}

export const SKILLS: readonly TaxonomySkill[] = [
  {
    "canonical": "Adaptability",
    "category": "soft",
    "weight": 0.6,
    "aliases": [
      "adaptable",
      "flexible"
    ]
  },
  {
    "canonical": "Adobe XD",
    "category": "tool",
    "weight": 0.7,
    "aliases": [
      "xd"
    ]
  },
  {
    "canonical": "Agile",
    "category": "tech",
    "weight": 0.8,
    "aliases": [
      "agile methodology",
      "kanban",
      "scrum"
    ]
  },
  {
    "canonical": "Airflow",
    "category": "tool",
    "weight": 0.7,
    "aliases": []
  },
  {
    "canonical": "Angular",
    "category": "tech",
    "weight": 0.9,
    "aliases": [
      "angular.js",
      "angularjs"
    ]
  },
  {
    "canonical": "Artificial Intelligence",
    "category": "tech",
    "weight": 1,
    "aliases": [
      "ai",
      "genai",
      "generative ai"
    ]
  },
  {
    "canonical": "AWS",
    "category": "tech",
    "weight": 1,
    "aliases": [
      "amazon web services",
      "ec2",
      "lambda",
      "s3"
    ]
  },
  {
    "canonical": "Azure",
    "category": "tech",
    "weight": 0.9,
    "aliases": [
      "microsoft azure"
    ]
  },
  {
    "canonical": "Blockchain",
    "category": "tech",
    "weight": 0.9,
    "aliases": [
      "crypto",
      "smart contracts",
      "solidity",
      "web3"
    ]
  },
  {
    "canonical": "Business Strategy",
    "category": "domain",
    "weight": 0.8,
    "aliases": [
      "consulting",
      "strategy"
    ]
  },
  {
    "canonical": "C#",
    "category": "tech",
    "weight": 1,
    "aliases": [
      ".net",
      "c sharp",
      "csharp"
    ]
  },
  {
    "canonical": "C++",
    "category": "tech",
    "weight": 1,
    "aliases": [
      "c plus plus",
      "cpp"
    ]
  },
  {
    "canonical": "CI/CD",
    "category": "tech",
    "weight": 0.8,
    "aliases": [
      "cicd",
      "continuous deployment",
      "continuous integration"
    ]
  },
  {
    "canonical": "Cloud Computing",
    "category": "tech",
    "weight": 0.9,
    "aliases": [
      "cloud"
    ]
  },
  {
    "canonical": "Communication",
    "category": "soft",
    "weight": 0.7,
    "aliases": [
      "communication skills",
      "verbal communication"
    ]
  },
  {
    "canonical": "Computer Vision",
    "category": "tech",
    "weight": 0.9,
    "aliases": [
      "cv",
      "image processing"
    ]
  },
  {
    "canonical": "Conference",
    "category": "domain",
    "weight": 1,
    "aliases": [
      "expo",
      "summit",
      "symposium"
    ]
  },
  {
    "canonical": "Creativity",
    "category": "soft",
    "weight": 0.7,
    "aliases": [
      "creative thinking",
      "innovation"
    ]
  },
  {
    "canonical": "Critical Thinking",
    "category": "soft",
    "weight": 0.7,
    "aliases": []
  },
  {
    "canonical": "CSS",
    "category": "tech",
    "weight": 0.7,
    "aliases": [
      "css3"
    ]
  },
  {
    "canonical": "Cybersecurity",
    "category": "tech",
    "weight": 0.9,
    "aliases": [
      "infosec",
      "penetration testing",
      "security"
    ]
  },
  {
    "canonical": "Data Analysis",
    "category": "tech",
    "weight": 0.9,
    "aliases": [
      "analytics",
      "business intelligence"
    ]
  },
  {
    "canonical": "Data Science",
    "category": "tech",
    "weight": 1,
    "aliases": [
      "data analytics"
    ]
  },
  {
    "canonical": "Data Visualization",
    "category": "tech",
    "weight": 0.8,
    "aliases": [
      "d3.js",
      "looker",
      "power bi",
      "tableau"
    ]
  },
  {
    "canonical": "DevOps",
    "category": "tech",
    "weight": 0.9,
    "aliases": [
      "site reliability",
      "sre"
    ]
  },
  {
    "canonical": "Docker",
    "category": "tech",
    "weight": 0.9,
    "aliases": [
      "container",
      "containers"
    ]
  },
  {
    "canonical": "Elasticsearch",
    "category": "tech",
    "weight": 0.8,
    "aliases": [
      "elk"
    ]
  },
  {
    "canonical": "Entrepreneurship",
    "category": "domain",
    "weight": 0.9,
    "aliases": [
      "entrepreneur",
      "founder",
      "startup",
      "venture"
    ]
  },
  {
    "canonical": "Excel",
    "category": "tool",
    "weight": 0.6,
    "aliases": [
      "microsoft excel",
      "spreadsheets"
    ]
  },
  {
    "canonical": "Fellowship",
    "category": "domain",
    "weight": 1,
    "aliases": [
      "fellow"
    ]
  },
  {
    "canonical": "Figma",
    "category": "tool",
    "weight": 0.8,
    "aliases": []
  },
  {
    "canonical": "Finance",
    "category": "domain",
    "weight": 0.9,
    "aliases": [
      "accounting",
      "financial analysis",
      "fintech"
    ]
  },
  {
    "canonical": "Fundraising",
    "category": "domain",
    "weight": 0.9,
    "aliases": [
      "capital raising",
      "investment"
    ]
  },
  {
    "canonical": "GCP",
    "category": "tech",
    "weight": 0.9,
    "aliases": [
      "google cloud",
      "google cloud platform"
    ]
  },
  {
    "canonical": "Git",
    "category": "tech",
    "weight": 0.8,
    "aliases": [
      "github",
      "gitlab",
      "version control"
    ]
  },
  {
    "canonical": "Go",
    "category": "tech",
    "weight": 1,
    "aliases": [
      "golang"
    ]
  },
  {
    "canonical": "Grant Writing",
    "category": "domain",
    "weight": 0.9,
    "aliases": [
      "proposal writing"
    ]
  },
  {
    "canonical": "GraphQL",
    "category": "tech",
    "weight": 0.9,
    "aliases": []
  },
  {
    "canonical": "Hackathon",
    "category": "domain",
    "weight": 1,
    "aliases": [
      "hackfest"
    ]
  },
  {
    "canonical": "HTML",
    "category": "tech",
    "weight": 0.7,
    "aliases": [
      "html5"
    ]
  },
  {
    "canonical": "Internship",
    "category": "domain",
    "weight": 1,
    "aliases": [
      "co-op",
      "intern"
    ]
  },
  {
    "canonical": "Java",
    "category": "tech",
    "weight": 1,
    "aliases": [
      "java11",
      "java8"
    ]
  },
  {
    "canonical": "JavaScript",
    "category": "tech",
    "weight": 1,
    "aliases": [
      "ecmascript",
      "js"
    ]
  },
  {
    "canonical": "Jupyter",
    "category": "tool",
    "weight": 0.7,
    "aliases": [
      "jupyter notebook"
    ]
  },
  {
    "canonical": "Kafka",
    "category": "tech",
    "weight": 0.8,
    "aliases": [
      "event streaming"
    ]
  },
  {
    "canonical": "Kotlin",
    "category": "tech",
    "weight": 0.9,
    "aliases": []
  },
  {
    "canonical": "Kubernetes",
    "category": "tech",
    "weight": 0.9,
    "aliases": [
      "k8s"
    ]
  },
  {
    "canonical": "Leadership",
    "category": "soft",
    "weight": 0.8,
    "aliases": [
      "leadership skills",
      "team lead"
    ]
  },
  {
    "canonical": "Linux",
    "category": "tech",
    "weight": 0.8,
    "aliases": [
      "bash",
      "shell",
      "unix"
    ]
  },
  {
    "canonical": "Machine Learning",
    "category": "tech",
    "weight": 1,
    "aliases": [
      "deep learning",
      "ml",
      "neural networks"
    ]
  },
  {
    "canonical": "Marketing",
    "category": "domain",
    "weight": 0.8,
    "aliases": [
      "digital marketing",
      "growth",
      "sem",
      "seo"
    ]
  },
  {
    "canonical": "Mentorship",
    "category": "soft",
    "weight": 0.7,
    "aliases": [
      "mentor"
    ]
  },
  {
    "canonical": "MLOps",
    "category": "tech",
    "weight": 0.8,
    "aliases": []
  },
  {
    "canonical": "Mobile Development",
    "category": "tech",
    "weight": 0.9,
    "aliases": [
      "android",
      "flutter",
      "ios",
      "mobile",
      "react native"
    ]
  },
  {
    "canonical": "Networking",
    "category": "soft",
    "weight": 0.6,
    "aliases": []
  },
  {
    "canonical": "Next.js",
    "category": "tech",
    "weight": 1,
    "aliases": [
      "next",
      "nextjs"
    ]
  },
  {
    "canonical": "NLP",
    "category": "tech",
    "weight": 0.9,
    "aliases": [
      "large language model",
      "llm",
      "natural language processing"
    ]
  },
  {
    "canonical": "Node.js",
    "category": "tech",
    "weight": 1,
    "aliases": [
      "node",
      "nodejs"
    ]
  },
  {
    "canonical": "NoSQL",
    "category": "tech",
    "weight": 0.9,
    "aliases": [
      "dynamodb",
      "firebase",
      "mongodb"
    ]
  },
  {
    "canonical": "NumPy",
    "category": "tech",
    "weight": 0.9,
    "aliases": []
  },
  {
    "canonical": "Open Source",
    "category": "domain",
    "weight": 0.7,
    "aliases": [
      "oss"
    ]
  },
  {
    "canonical": "Pandas",
    "category": "tech",
    "weight": 0.9,
    "aliases": []
  },
  {
    "canonical": "PHP",
    "category": "tech",
    "weight": 0.9,
    "aliases": []
  },
  {
    "canonical": "PostgreSQL",
    "category": "tech",
    "weight": 0.9,
    "aliases": [
      "pgsql",
      "postgres",
      "psql"
    ]
  },
  {
    "canonical": "Problem Solving",
    "category": "soft",
    "weight": 0.8,
    "aliases": [
      "analytical thinking",
      "problem-solving"
    ]
  },
  {
    "canonical": "Product Management",
    "category": "domain",
    "weight": 0.9,
    "aliases": [
      "pm",
      "product manager"
    ]
  },
  {
    "canonical": "Project Management",
    "category": "domain",
    "weight": 0.9,
    "aliases": [
      "pmp",
      "project manager"
    ]
  },
  {
    "canonical": "Public Speaking",
    "category": "soft",
    "weight": 0.7,
    "aliases": [
      "presentation skills"
    ]
  },
  {
    "canonical": "Python",
    "category": "tech",
    "weight": 1,
    "aliases": [
      "py",
      "python3"
    ]
  },
  {
    "canonical": "PyTorch",
    "category": "tech",
    "weight": 0.9,
    "aliases": [
      "torch"
    ]
  },
  {
    "canonical": "QA Testing",
    "category": "tech",
    "weight": 0.8,
    "aliases": [
      "cypress",
      "jest",
      "playwright",
      "qa",
      "quality assurance",
      "testing"
    ]
  },
  {
    "canonical": "React",
    "category": "tech",
    "weight": 1,
    "aliases": [
      "react js",
      "react.js",
      "reactjs"
    ]
  },
  {
    "canonical": "Redis",
    "category": "tech",
    "weight": 0.8,
    "aliases": [
      "memcached"
    ]
  },
  {
    "canonical": "Remote Work",
    "category": "domain",
    "weight": 0.7,
    "aliases": [
      "async",
      "distributed team",
      "remote"
    ]
  },
  {
    "canonical": "Research",
    "category": "domain",
    "weight": 0.8,
    "aliases": [
      "academic research",
      "research skills"
    ]
  },
  {
    "canonical": "REST API",
    "category": "tech",
    "weight": 0.9,
    "aliases": [
      "api",
      "rest",
      "restful"
    ]
  },
  {
    "canonical": "Ruby",
    "category": "tech",
    "weight": 0.9,
    "aliases": [
      "rails",
      "ruby on rails"
    ]
  },
  {
    "canonical": "Rust",
    "category": "tech",
    "weight": 1,
    "aliases": []
  },
  {
    "canonical": "Sales",
    "category": "domain",
    "weight": 0.8,
    "aliases": [
      "bizdev",
      "business development"
    ]
  },
  {
    "canonical": "Scholarship",
    "category": "domain",
    "weight": 1,
    "aliases": [
      "bursary",
      "financial aid"
    ]
  },
  {
    "canonical": "Scikit-Learn",
    "category": "tech",
    "weight": 0.9,
    "aliases": [
      "scikit learn",
      "sklearn"
    ]
  },
  {
    "canonical": "Sketch",
    "category": "tool",
    "weight": 0.7,
    "aliases": []
  },
  {
    "canonical": "SQL",
    "category": "tech",
    "weight": 1,
    "aliases": [
      "ansi sql",
      "sql server",
      "t-sql"
    ]
  },
  {
    "canonical": "Swift",
    "category": "tech",
    "weight": 0.9,
    "aliases": []
  },
  {
    "canonical": "Tailwind CSS",
    "category": "tech",
    "weight": 0.8,
    "aliases": [
      "tailwind",
      "tailwindcss"
    ]
  },
  {
    "canonical": "Teamwork",
    "category": "soft",
    "weight": 0.7,
    "aliases": [
      "collaboration",
      "team player"
    ]
  },
  {
    "canonical": "TensorFlow",
    "category": "tech",
    "weight": 0.9,
    "aliases": []
  },
  {
    "canonical": "Terraform",
    "category": "tech",
    "weight": 0.8,
    "aliases": []
  },
  {
    "canonical": "Time Management",
    "category": "soft",
    "weight": 0.6,
    "aliases": []
  },
  {
    "canonical": "TypeScript",
    "category": "tech",
    "weight": 1,
    "aliases": [
      "ts"
    ]
  },
  {
    "canonical": "UI/UX Design",
    "category": "tech",
    "weight": 0.9,
    "aliases": [
      "product design",
      "ui",
      "ui/ux",
      "user experience",
      "user interface",
      "ux"
    ]
  },
  {
    "canonical": "Volunteering",
    "category": "domain",
    "weight": 0.6,
    "aliases": [
      "volunteer"
    ]
  },
  {
    "canonical": "Vue.js",
    "category": "tech",
    "weight": 0.9,
    "aliases": [
      "vue",
      "vuejs"
    ]
  },
  {
    "canonical": "Web Development",
    "category": "tech",
    "weight": 1,
    "aliases": [
      "backend",
      "frontend",
      "full stack",
      "full-stack",
      "web dev"
    ]
  },
  {
    "canonical": "Workshop",
    "category": "domain",
    "weight": 0.8,
    "aliases": [
      "bootcamp"
    ]
  },
  {
    "canonical": "Writing",
    "category": "soft",
    "weight": 0.7,
    "aliases": [
      "content writing",
      "copywriting",
      "technical writing"
    ]
  }
] as const;

/** Lowercased alias (and canonical) -> canonical skill name. */
export const ALIAS_TO_CANONICAL: Readonly<Record<string, string>> = {
  "adaptable": "Adaptability",
  "flexible": "Adaptability",
  "xd": "Adobe XD",
  "agile methodology": "Agile",
  "kanban": "Agile",
  "scrum": "Agile",
  "angular.js": "Angular",
  "angularjs": "Angular",
  "ai": "Artificial Intelligence",
  "genai": "Artificial Intelligence",
  "generative ai": "Artificial Intelligence",
  "amazon web services": "AWS",
  "ec2": "AWS",
  "lambda": "AWS",
  "s3": "AWS",
  "microsoft azure": "Azure",
  "crypto": "Blockchain",
  "smart contracts": "Blockchain",
  "solidity": "Blockchain",
  "web3": "Blockchain",
  "consulting": "Business Strategy",
  "strategy": "Business Strategy",
  ".net": "C#",
  "c sharp": "C#",
  "csharp": "C#",
  "c plus plus": "C++",
  "cpp": "C++",
  "cicd": "CI/CD",
  "continuous deployment": "CI/CD",
  "continuous integration": "CI/CD",
  "cloud": "Cloud Computing",
  "communication skills": "Communication",
  "verbal communication": "Communication",
  "cv": "Computer Vision",
  "image processing": "Computer Vision",
  "expo": "Conference",
  "summit": "Conference",
  "symposium": "Conference",
  "creative thinking": "Creativity",
  "innovation": "Creativity",
  "css3": "CSS",
  "infosec": "Cybersecurity",
  "penetration testing": "Cybersecurity",
  "security": "Cybersecurity",
  "analytics": "Data Analysis",
  "business intelligence": "Data Analysis",
  "data analytics": "Data Science",
  "d3.js": "Data Visualization",
  "looker": "Data Visualization",
  "power bi": "Data Visualization",
  "tableau": "Data Visualization",
  "site reliability": "DevOps",
  "sre": "DevOps",
  "container": "Docker",
  "containers": "Docker",
  "elk": "Elasticsearch",
  "entrepreneur": "Entrepreneurship",
  "founder": "Entrepreneurship",
  "startup": "Entrepreneurship",
  "venture": "Entrepreneurship",
  "microsoft excel": "Excel",
  "spreadsheets": "Excel",
  "fellow": "Fellowship",
  "accounting": "Finance",
  "financial analysis": "Finance",
  "fintech": "Finance",
  "capital raising": "Fundraising",
  "investment": "Fundraising",
  "google cloud": "GCP",
  "google cloud platform": "GCP",
  "github": "Git",
  "gitlab": "Git",
  "version control": "Git",
  "golang": "Go",
  "proposal writing": "Grant Writing",
  "hackfest": "Hackathon",
  "html5": "HTML",
  "co-op": "Internship",
  "intern": "Internship",
  "java11": "Java",
  "java8": "Java",
  "ecmascript": "JavaScript",
  "js": "JavaScript",
  "jupyter notebook": "Jupyter",
  "event streaming": "Kafka",
  "k8s": "Kubernetes",
  "leadership skills": "Leadership",
  "team lead": "Leadership",
  "bash": "Linux",
  "shell": "Linux",
  "unix": "Linux",
  "deep learning": "Machine Learning",
  "ml": "Machine Learning",
  "neural networks": "Machine Learning",
  "digital marketing": "Marketing",
  "growth": "Marketing",
  "sem": "Marketing",
  "seo": "Marketing",
  "mentor": "Mentorship",
  "android": "Mobile Development",
  "flutter": "Mobile Development",
  "ios": "Mobile Development",
  "mobile": "Mobile Development",
  "react native": "Mobile Development",
  "next": "Next.js",
  "nextjs": "Next.js",
  "large language model": "NLP",
  "llm": "NLP",
  "natural language processing": "NLP",
  "node": "Node.js",
  "nodejs": "Node.js",
  "dynamodb": "NoSQL",
  "firebase": "NoSQL",
  "mongodb": "NoSQL",
  "oss": "Open Source",
  "pgsql": "PostgreSQL",
  "postgres": "PostgreSQL",
  "psql": "PostgreSQL",
  "analytical thinking": "Problem Solving",
  "problem-solving": "Problem Solving",
  "pm": "Product Management",
  "product manager": "Product Management",
  "pmp": "Project Management",
  "project manager": "Project Management",
  "presentation skills": "Public Speaking",
  "py": "Python",
  "python3": "Python",
  "torch": "PyTorch",
  "cypress": "QA Testing",
  "jest": "QA Testing",
  "playwright": "QA Testing",
  "qa": "QA Testing",
  "quality assurance": "QA Testing",
  "testing": "QA Testing",
  "react js": "React",
  "react.js": "React",
  "reactjs": "React",
  "memcached": "Redis",
  "async": "Remote Work",
  "distributed team": "Remote Work",
  "remote": "Remote Work",
  "academic research": "Research",
  "research skills": "Research",
  "api": "REST API",
  "rest": "REST API",
  "restful": "REST API",
  "rails": "Ruby",
  "ruby on rails": "Ruby",
  "bizdev": "Sales",
  "business development": "Sales",
  "bursary": "Scholarship",
  "financial aid": "Scholarship",
  "scikit learn": "Scikit-Learn",
  "sklearn": "Scikit-Learn",
  "ansi sql": "SQL",
  "sql server": "SQL",
  "t-sql": "SQL",
  "tailwind": "Tailwind CSS",
  "tailwindcss": "Tailwind CSS",
  "collaboration": "Teamwork",
  "team player": "Teamwork",
  "ts": "TypeScript",
  "product design": "UI/UX Design",
  "ui": "UI/UX Design",
  "ui/ux": "UI/UX Design",
  "user experience": "UI/UX Design",
  "user interface": "UI/UX Design",
  "ux": "UI/UX Design",
  "volunteer": "Volunteering",
  "vue": "Vue.js",
  "vuejs": "Vue.js",
  "backend": "Web Development",
  "frontend": "Web Development",
  "full stack": "Web Development",
  "full-stack": "Web Development",
  "web dev": "Web Development",
  "bootcamp": "Workshop",
  "content writing": "Writing",
  "copywriting": "Writing",
  "technical writing": "Writing"
} as const;

export const SKILL_COUNT_BY_CATEGORY: Readonly<Record<SkillCategory, number>> = {
  "soft": 12,
  "tool": 6,
  "tech": 59,
  "domain": 19
} as const;

export const SKILL_COUNT = 96;
