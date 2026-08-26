/**
 * Centralized API Client for Olympiad Portal
 */

const getApiBaseUrl = () => {
  // An address configured in js/config.js wins. Deriving the API from the
  // page's own location only holds when one server answers for both; on shared
  // hosting the pages and the Node app usually live at different addresses.
  const configured = String(window.IQBABA_API_BASE || '').trim();
  if (configured) {
    const trimmed = configured.replace(/\/+$/, '');
    return /\/api$/.test(trimmed) ? trimmed : trimmed + '/api';
  }

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

    let response;
    try {
      response = await fetch(url, config);
    } catch (error) {
      // fetch only rejects when the request never completed: the server is
      // down, the address is wrong, or CORS blocked it. Browsers word this
      // very differently, so say what we were doing instead.
      console.error(`API Error (${endpoint}):`, error);
      throw new Error(`Could not reach the server at ${url}. Check that the API is running and try again.`);
    }

    // Read the body as text first. A 404, a crashed server or a proxy answers
    // with an HTML page, and response.json() would reject with a parser message
    // that names neither the URL nor the status ("The string did not match the
    // expected pattern." in Safari, "Unexpected token '<'" in Chrome).
    const raw = await response.text();
    let data = null;
    if (raw.trim()) {
      try {
        data = JSON.parse(raw);
      } catch (parseError) {
        console.error(`API Error (${endpoint}): expected JSON, got:`, raw.slice(0, 500));
        throw new Error(response.status === 404
          ? `The server has no API at ${url} (404). Check that the backend is deployed at this address.`
          : `The server returned ${response.status} ${response.statusText} instead of JSON. Check the server logs.`);
      }
    }

    if (!response.ok) {
      const message = (data && data.message) || `API request failed (${response.status})`;
      console.error(`API Error (${endpoint}):`, message);
      throw new Error(message);
    }

    // 204 No Content and friends have nothing to parse.
    return data === null ? {} : data;
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

  async getPublicBoards() { return this.request('/auth/boards'); },

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
  async bulkAddAdminQuestions(questions) {
    return this.request('/admin/questions/bulk', {
      method: 'POST',
      body: JSON.stringify({ questions })
    });
  },
  async updateAdminQuestion(id, questionData) {
    return this.request(`/admin/questions/${id}`, {
      method: 'PUT',
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

  async updateAdminStudent(id, studentData) {
    return this.request(`/admin/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(studentData)
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

  async updateAdminSchool(id, schoolData) {
    return this.request(`/admin/schools/${id}`, {
      method: 'PUT',
      body: JSON.stringify(schoolData)
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
  async updateAdminBoard(id, data) {
    return this.request(`/admin/boards/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  async deleteAdminBoard(id) {
    return this.request(`/admin/boards/${id}`, { method: 'DELETE' });
  },

  // Classes
  async getAdminClasses() { return this.request('/admin/classes'); },
  async addAdminClass(data) {
    return this.request('/admin/classes', { method: 'POST', body: JSON.stringify(data) });
  },
  async updateAdminClass(id, data) {
    return this.request(`/admin/classes/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  async deleteAdminClass(id) {
    return this.request(`/admin/classes/${id}`, { method: 'DELETE' });
  },

  // Topics
  async getAdminTopics() { return this.request('/admin/topics'); },
  async addAdminTopic(data) {
    return this.request('/admin/topics', { method: 'POST', body: JSON.stringify(data) });
  },
  async updateAdminTopic(id, data) {
    return this.request(`/admin/topics/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  async deleteAdminTopic(id) {
    return this.request(`/admin/topics/${id}`, { method: 'DELETE' });
  },

  // Subjects
  async getAdminSubjects() { return this.request('/admin/subjects'); },
  async addAdminSubject(data) {
    return this.request('/admin/subjects', { method: 'POST', body: JSON.stringify(data) });
  },
  async updateAdminSubject(id, data) {
    return this.request(`/admin/subjects/${id}`, { method: 'PUT', body: JSON.stringify(data) });
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
  async updateSchoolStudent(id, studentData) {
    return this.request(`/schools/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(studentData)
    });
  },
  async deleteSchoolStudent(id) {
    return this.request(`/schools/students/${id}`, { method: 'DELETE' });
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
