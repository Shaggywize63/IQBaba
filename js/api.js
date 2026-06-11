/**
 * Centralized API Client for Olympiad Portal
 */

const getApiBaseUrl = () => {
  const pathname = window.location.pathname;
  const parts = pathname.split('/');
  // If the last part looks like a file (contains a dot), remove it
  if (parts[parts.length - 1].includes('.')) {
    parts.pop();
  }
  const basePath = parts.join('/');
  // Ensure it ends with /api but avoid double slashes
  return (basePath.endsWith('/') ? basePath : basePath + '/') + 'api';
};

const API_BASE_URL = getApiBaseUrl();

const api = {
  // --- Token Management ---
  setToken: (token, role) => {
    localStorage.setItem('token', token);
    localStorage.setItem('role', role);
  },
  
  getToken: () => localStorage.getItem('token'),
  getRole: () => localStorage.getItem('role'),
  
  clearAuth: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
  },

  // --- Base Fetch Wrapper ---
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    
    // Set up headers
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Inject Auth Token if available
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
      ...options,
      headers,
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'API request failed');
      }
      
      return data;
    } catch (error) {
      console.error(`API Error (${endpoint}):`, error);
      throw error;
    }
  },

  // --- Auth Endpoints ---
  async login(username, password, role) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, role })
    });
    
    if (data.token) {
      this.setToken(data.token, role);
    }
    return data;
  },

  async registerStudent(studentData) {
    const data = await this.request('/auth/register/student', {
      method: 'POST',
      body: JSON.stringify(studentData)
    });
    
    if (data.token) {
      this.setToken(data.token, 'student');
    }
    return data;
  },

  // --- Admin Endpoints ---
  async getAdminStats() { return this.request('/admin/stats'); },
  async getAdminStudents() { return this.request('/admin/students'); },
  async getAdminStudentsBySchool(schoolId) { return this.request(`/admin/students?schoolId=${schoolId}`); },
  async getAdminSchools() { return this.request('/admin/schools'); },
  async getAdminResults() { return this.request('/admin/results'); },
  async getAdminQuestions() { return this.request('/admin/questions'); },
  async getAdminExams() { return this.request('/admin/exams'); },
  async addAdminSchool(schoolData) {
    return this.request('/admin/schools', {
      method: 'POST',
      body: JSON.stringify(schoolData)
    });
  },
  async bulkAddAdminSchools(schools) {
    return this.request('/admin/schools/bulk', {
      method: 'POST',
      body: JSON.stringify({ schools })
    });
  },
  async bulkAddAdminStudents(students) {
    return this.request('/admin/students/bulk', {
      method: 'POST',
      body: JSON.stringify({ students })
    });
  },
  async addAdminStudent(studentData) {
    return this.request('/admin/students', {
      method: 'POST',
      body: JSON.stringify(studentData)
    });
  },
  async addAdminQuestion(questionData) {
    return this.request('/admin/questions', {
      method: 'POST',
      body: JSON.stringify(questionData)
    });
  },
  async deleteAdminQuestion(id) {
    return this.request(`/admin/questions/${id}`, { method: 'DELETE' });
  },
  async createAdminExam(examData) {
    return this.request('/admin/exams', {
      method: 'POST',
      body: JSON.stringify(examData)
    });
  },

  async deleteAdminStudent(id) {
    return this.request(`/admin/students/${id}`, { method: 'DELETE' });
  },
  async updateAdminStudentStatus(id, status) {
    return this.request(`/admin/students/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
  },

  async deleteAdminSchool(id) {
    return this.request(`/admin/schools/${id}`, { method: 'DELETE' });
  },
  async updateAdminSchoolStatus(id, status) {
    return this.request(`/admin/schools/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
  },

  // Boards
  async getAdminBoards() { return this.request('/admin/boards'); },
  async addAdminBoard(data) {
    return this.request('/admin/boards', { method: 'POST', body: JSON.stringify(data) });
  },
  async deleteAdminBoard(id) {
    return this.request(`/admin/boards/${id}`, { method: 'DELETE' });
  },

  // Classes
  async getAdminClasses() { return this.request('/admin/classes'); },
  async addAdminClass(data) {
    return this.request('/admin/classes', { method: 'POST', body: JSON.stringify(data) });
  },
  async deleteAdminClass(id) {
    return this.request(`/admin/classes/${id}`, { method: 'DELETE' });
  },

  // Topics
  async getAdminTopics() { return this.request('/admin/topics'); },
  async addAdminTopic(data) {
    return this.request('/admin/topics', { method: 'POST', body: JSON.stringify(data) });
  },
  async deleteAdminTopic(id) {
    return this.request(`/admin/topics/${id}`, { method: 'DELETE' });
  },

  // Subjects
  async getAdminSubjects() { return this.request('/admin/subjects'); },
  async addAdminSubject(data) {
    return this.request('/admin/subjects', { method: 'POST', body: JSON.stringify(data) });
  },
  async deleteAdminSubject(id) {
    return this.request(`/admin/subjects/${id}`, { method: 'DELETE' });
  },

  // --- School Endpoints ---
  async getSchoolStats() { return this.request('/schools/stats'); },
  async getSchoolStudents() { return this.request('/schools/students'); },
  async addSchoolStudent(studentData) {
    return this.request('/schools/students', {
      method: 'POST',
      body: JSON.stringify(studentData)
    });
  },
  async bulkAddSchoolStudents(students) {
    return this.request('/schools/students/bulk', {
      method: 'POST',
      body: JSON.stringify({ students })
    });
  },
  async getSchoolResults() { return this.request('/schools/results'); },

  // --- Student & Exam Endpoints ---
  async getStudentDashboard() { return this.request('/students/dashboard'); },
  async getStudentProfile() { return this.request('/students/profile'); },
  async updateStudentProfile(profileData) {
    return this.request('/students/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData)
    });
  },
  
  async getExamQuestions(examId) {
    return this.request(`/exams/${examId}/questions`);
  },
  
  async submitExam(examId, answers) {
    return this.request(`/exams/${examId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers })
    });
  },
  
  async contactSupport(supportData) {
    return this.request('/support/contact', {
      method: 'POST',
      body: JSON.stringify(supportData)
    });
  }
};

window.api = api;
