## MyPDF

A local tool like [iLovePDF](https://www.ilovepdf.com/), but works on your local environment for data privacy.

### Features
1. Convert, merge, split, and compress PDF files locally.
2. Ensures data privacy by processing files on your local machine.
3. Simple and intuitive web interface.


### Usage

Follow these steps to set up and run the MyPDF application locally:

1. **Clone the Repository**
   Clone the project repository to your local machine:
   ```bash
   git clone https://github.com/gndlwch2w/mypdf.git
   cd mypdf
   ```

2. **Set Up a Virtual Environment**
   Create and activate a Python virtual environment to isolate dependencies:
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   ```

3. **Install Dependencies**
   Install the required Python packages listed in `requirements.txt`:
   ```bash
   pip install -r backend/requirements.txt
   ```

4. **Run the Application**
   Start the backend server using Uvicorn:
   ```bash
   .venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
   ```

5. **Access the Web Interface**
   Open your browser and navigate to `http://127.0.0.1:8000` to use the application.
