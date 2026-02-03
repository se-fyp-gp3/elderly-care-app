# Interim Report - James' Section

## 4. Requirements

### 4.2 Functions provided + data processed

#### Elderly User Functions

The Elderly module of the application focuses on accessibility, medication adherence, and safety. The core functions provided for the Elderly user include:

1.  **Medication Management**:
    *   **View Medication Schedule**: Displays a daily timeline of medications to be taken, sorted by time (e.g., Morning, Afternoon, Evening).
    *   **Log Medication Intake**: Allows the user to mark a medication reminder as "Taken" or "Skipped".
    *   **Medication History**: View past medication logs to track adherence.
    *   **Add Medication**: Manually add new medication details (Name, Dosage, Frequency, Duration) to the schedule.

2.  **Emergency Response System**:
    *   **One-Touch SOS**: A prominent, easily accessible button to immediately dial emergency services (999).
    *   **Emergency Contacts**: A managed list of close contacts (family, caregivers) that can be quick-dialed.

3.  **Personal Schedule**:
    *   **View Calendar**: A simplified list view of upcoming appointments (medical checkups, family events) managed by caregivers or the elderly user.

4.  **Health Monitoring**:
    *   **Health Dashboard**: View vital health metrics.
    *   **Chat Assistance**: Interactive chat interface for queries (likely AI or Caregiver connected).

#### Data Processed (Elderly)

The system processes the following data entities relevant to the Elderly user:

*   **Elderly Profile**: `User ID`, `Name`, `Phone`, `Date of Birth`, `Status` (Normal/Warning).
*   **Medication Data**:
    *   *Reference Data*: `Medication Name`, `Unit`, `Dosage`, `Frequency`, `Times per Day`.
    *   *Transactional Data*: `Medication Logs` (Time taken, Status: Pending/Taken/Missed).
*   **Schedule Data**: `Event Title`, `Time`, `Description`, `Category`.
*   **Emergency Data**: `Contact Name`, `Relationship`, `Phone Number`.

### 4.2.1 Data Entities & Database Relationships (Elderly Module)

The system utilizes Appwrite's Database to manage the complex relationships between the elderly user, their caregivers, and their daily health activities. The following data entities are directly related to the Elderly module:

#### 1. Core Profile & Management
*   **Elderly (`elderly`)**: The central entity representing the user.
    *   *Relationships*: One-to-Many with Medications, Schedules, Health Data, and Logs. Many-to-Many with Caregivers.
    *   *Key Fields*: `user_id` (Auth Link), `status` (Normal/SOS status), `birth`, `phone`.
*   **CaregiverElderly (`caregiver_elderly`)**: A junction table enabling the Many-to-Many relationship.
    *   *Function*: Allows an elderly person to have multiple caregivers (e.g., family + nurse) and a caregiver to manage multiple elderly users.

#### 2. Medication Management Sub-system
This module uses a tiered data structure to separate the *prescription* from the *daily execution*.

*   **Medication (`medication`)**: Global reference dictionary of available medicines.
    *   *Fields*: `name`, `unit` (mg, ml, pill).
*   **ElderlyMedication (`elderly_medication`)**: A specific prescription for an elderly user.
    *   *Relationships*: Links `Elderly` and `Medication`.
    *   *Fields*: `active` (boolean), `times_per_day`, `dosage`, `frequency`, `is_prn` (as-needed).
*   **ElderlyMedicationReminder (`active_reminders`)**: Configuration for active alerts.
    *   *Function*: Controls *when* alarms ring on the device.
    *   *Fields*: `reminder_times` (Array of Active Times e.g., ["08:00", "20:00"]), `start_date`, `duration_days`, `after_meal` (instruction).
*   **MedicationLog (`medication_logs`)**: The compliance history.
    *   *Function*: Generated daily or upon action. Records the actual event.
    *   *Fields*: `status` (Pending/Taken/Skipped), `taken_at` (Timestamp), `scheduled_at` (Target time).

#### 3. Scheduling & Activities
*   **Schedule (`schedule`)**: Calendar events displayed on the timeline.
    *   *Relationships*: Links `Elderly` to `ScheduleCategory`.
    *   *Fields*: `time`, `title`, `description`, `status` (Pending/Completed).
*   **ScheduleCategory (`schedule_category`)**: Metadata for event types.
    *   *Fields*: `name` (Checkup, Exercise, Family), `color_hex` (UI styling), `svg_icon`.

#### 4. Health & Communications
*   **HealthData (`health_data`)**: Time-series storage for vital signs.
    *   *Fields*: `type` (Heart Rate, Blood Pressure), `value`, `time` (Timestamp).
*   **ChatSession (`chat_session`)**: Stores context for AI or Support chat.
    *   *Fields*: `user_id`, `messages` (JSON/Text history), `updated_at`.

#### Entity Relationship Summary

| Source Entity | Relationship | Target Entity | Purpose |
| :--- | :---: | :--- | :--- |
| **Elderly** | 1 : N | **ElderlyMedication** | Personal Prescription List |
| **Elderly** | 1 : N | **Schedule** | Personal Agenda |
| **Elderly** | 1 : N | **HealthData** | Vitals History |
| **Elderly** | 1 : N | **MedicationLog** | Adherence Records |
| **Elderly** | N : N | **Caregiver** | Care Circle (via Junction) |
| **ElderlyMedication** | 1 : N | **MedicationLog** | Tracking history per medicine |

---

## 5. Problem Analysis Documentation

### 5.1 Use case descriptions (Elderly)

#### Use Case 1: Log Medication Intake

| Field | Description |
| :--- | :--- |
| **Use Case Name** | Log Medication Intake |
| **Actor** | Elderly User |
| **Description** | The user marks a scheduled medication reminder as "Taken" within the application to update their adherence record. |
| **Preconditions** | 1. User is logged in.<br>2. A medication reminder exists for the current time block. |
| **Postconditions** | 1. The medication status is updated to "Taken" in the database.<br>2. A `MedicationLog` entry is created.<br>3. The UI moves the item to the "Completed" section. |
| **Normal Flow** | 1. User opens the "Medication" tab.<br>2. System displays list of "To Do" medications.<br>3. User locates the specific medication card.<br>4. User taps the "Take" (Checkmark) button.<br>5. System confirms the action and updates the list. |
| **Alternative Flows** | **A1: Mark as Skipped**<br>4a. User swipes or selects option to "Skip".<br>4b. System prompts for a reason (optional).<br>4c. Status updates to "Skipped". |

#### Use Case 2: Trigger Emergency Alert

| Field | Description |
| :--- | :--- |
| **Use Case Name** | Trigger Emergency Alert |
| **Actor** | Elderly User |
| **Description** | The user activates the emergency protocol to contact emergency services. |
| **Preconditions** | User has the application open (or widget access). |
| **Postconditions** | Native phone dialer is launched with "999" pre-filled. |
| **Normal Flow** | 1. User navigates to the "Emergency" tab (or taps floating emergency action).<br>2. User taps the large red "Call 999 Now" button.<br>3. System presents a confirmation dialog (to prevent accidental touches).<br>4. User confirms "Call".<br>5. System launches native phone dialer with emergency number. |

#### Use Case 3: Consult AI Health Assistant

| Field | Description |
| :--- | :--- |
| **Use Case Name** | Consult AI Health Assistant |
| **Actor** | Elderly User |
| **Description** | The user interacts with the chatbot to ask non-emergency health questions or clarify medication instructions. |
| **Preconditions** | Internet connection is active. |
| **Postconditions** | A new message is appended to the chat history; AI response is displayed. |
| **Normal Flow** | 1. User taps the "Chat" card on the Dashboard.<br>2. User types a question (e.g., "Should I take Aspirin with food?").<br>3. System sends query to backend AI service.<br>4. System displays text response with safety disclaimer. |
| **Alternative Flows** | **A1: Voice Input**<br>2a. User taps Microphone icon.<br>2b. User speaks the question.<br>2c. System converts speech to text. |

#### Use Case 4: View Appointment Schedule

| Field | Description |
| :--- | :--- |
| **Use Case Name** | View Appointment Schedule |
| **Actor** | Elderly User |
| **Description** | The user checks their daily timeline for upcoming medical appointments or family visits. |
| **Preconditions** | Caregivers have populated the schedule. |
| **Normal Flow** | 1. User navigates to the "Schedule" tab.<br>2. System displays current day's events chronologically.<br>3. User taps a specific "Doctor Visit" event.<br>4. System expands card to show address and notes. |

#### Use Case 5: Contact Primary Caregiver

| Field | Description |
| :--- | :--- |
| **Use Case Name** | Contact Primary Caregiver |
| **Actor** | Elderly User |
| **Description** | The user initiates a voice call to a designated family member without manually dialing. |
| **Postconditions** | Native phone dialer is launched with caregiver's number. |
| **Normal Flow** | 1. User navigates to "Emergency" tab.<br>2. User scrolls to "Emergency Contacts" list.<br>3. User locates "Son/Daughter" contact.<br>4. User taps the Phone icon.<br>5. System confirms intent to call.<br>6. Native dialer launches. |

#### Use Case 6: View Health Vitals

| Field | Description |
| :--- | :--- |
| **Use Case Name** | View Health Vitals |
| **Actor** | Elderly User |
| **Description** | The user reviews their recorded health metrics (e.g., Heart Rate, Blood Pressure) to monitor trends. |
| **Preconditions** | Health data has been synced from devices or manually entered. |
| **Normal Flow** | 1. User navigates to "Health Data" tab.<br>2. System presents summary cards (e.g., "Avg HR: 72 bpm").<br>3. User taps "Heart Rate" card.<br>4. System displays a chart showing the last 7 days of data. |

---

## 6. Detailed Design Documentation

### 6.3 User Interface Design (Elderly)

The User Interface for the Elderly persona is designed with **Accessibility** and **Simplicity** as primary drivers.

1.  **High Contrast & Large Typography**:
    *   The application uses "Paper" theming with high-contrast distinct colors for key actions (Green for "Take Meds", Red for "Emergency").
    *   Font sizes adhere to `headlineMedium` and `bodyLarge` standards to ensure readability for users with declining vision.

2.  **Simplified Navigation**:
    *   A bottom tab bar provides persistent access to the four core areas: `Home`, `Medication`, `Emergency`, and `Schedule`.
    *   Complex settings are tucked away in a "More" tab to prevent cognitive overload on the main screens.

3.  **Card-Based Layouts**:
    *   Information is presented in distinct "Cards" (e.g., `ElderlyCard`, `MedicationCard`). This groups related information visually, making it easier to scan.
    *   **Medication Screen**: Uses a "To-Do" list metaphor. Pending items are at the top; completed items move to simple history list, providing immediate visual feedback on progress.

4.  **Feedback Mechanisms**:
    *   Modal confirmations preventing accidental emergency calls.
    *   Visual indicators (Chip tags) for status (e.g., "Pending", "Completed").

---

## 7. Critical Evaluation

### 7.1 Tech Risk / Implementation Issues (James)

#### 1. AI Accuracy & Hallucinations
*   **Risk**: If the application employs Generative AI for the "Chat" or health advice features, there is a significant risk of "hallucinations"—where the AI provides incorrect or medically unsafe advice.
*   **Mitigation**: The system must have strict bounds / system prompts that prevent it from giving medical diagnoses. All AI responses should carry a disclaimer, or the feature should be limited to summarizing data rather than advising.

#### 2. Fall Detection False Positives
*   **Risk**: Mobile-based fall detection relying solely on the phone's accelerometer/gyroscope is prone to high false-positive rates. Dropping the phone on a table or sitting down quickly can trigger an alarm, causing distress to the elderly user and "alert fatigue" for the caregiver.
*   **Limitation**: Unlike wrist-worn devices, a phone is not always on the user's person.
*   **Mitigation**: Implement a "Pre-alarm" countdown (e.g., 30 seconds) allowing the user to cancel the alert before it is sent to the caregiver.

#### 3. Device Sensor Limits
*   **Issue**: relying on standard smartphone sensors for health monitoring (heart rate via camera, gait analysis via accelerometer) has precision limits compared to medical-grade equipment.
*   **Impact**: Data collected may be noisy or inaccurate, leading to incorrect trends in the "Health Data" dashboard.
*   **Recommendation**: Clearly label data as "Informational Only" and support integration with dedicated wearables (e.g., via HealthKit/Google Fit) for more accurate inputs.
