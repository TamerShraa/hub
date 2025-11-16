const PAGE_DEFINITIONS = {
  sstda: {
    id: 'sstda',
    label: 'SSTDA',
    categories: ['Courses - Recorded', 'Courses - Online', 'Courses - Onsite', 'Services', 'Analysis', 'Solutions', 'Consultation', 'Products']
  },
  tamer: {
    id: 'tamer',
    label: 'Tamer Personal',
    categories: ['Courses - Recorded', 'Courses - Online', 'Courses - Onsite', 'Analysis Services', 'Consultation']
  },
  majdi: {
    id: 'majdi',
    label: 'Majdi Personal',
    categories: ['Courses - Recorded', 'Courses - Online', 'Courses - Onsite', 'Services', 'Analysis']
  },
  research: {
    id: 'research',
    label: 'Research Work',
    categories: ['Master Thesis', 'PhD Thesis', 'Research Paper', 'Proposal']
  }
};

const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  STAFF: 'staff'
};

const INCOME_SOURCES = ['Facebook Ads', 'University Partnership', 'Direct', 'Referral', 'Community', 'Other'];

const PRODUCT_TYPES = ['Recorded', 'Live / Cohort', 'Consultation', 'Analysis', 'Solutions', 'Services'];

const QUICK_PRESETS = ['thisWeek', 'thisMonth', 'lastMonth'];

module.exports = {
  PAGE_DEFINITIONS,
  ROLES,
  INCOME_SOURCES,
  PRODUCT_TYPES,
  QUICK_PRESETS
};
