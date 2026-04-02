# 🎨 PolyLine Editor

## 📌 Project Overview

The **PolyLine Editor** is an interactive web-based drawing tool that allows users to create, edit, and manage polylines on a canvas. It is designed with strong **Human-Computer Interaction (HCI)** principles, providing an intuitive and user-friendly experience.

This project demonstrates concepts like direct manipulation, feedback, undo/redo, and accessibility.

---

## ✨ Features

### 🖊️ Drawing & Editing

* Draw polylines by clicking on the canvas
* Double-click or right-click to finish a polyline
* Move points by dragging
* Delete individual points or entire polylines

### 🎛️ Modes

* **Draw Mode (B)** – Create new polylines
* **Move Mode (M)** – Adjust existing points
* **Delete Mode (D)** – Remove points

### 🎨 Customization

* Multiple stroke colors
* Color selection panel
* Visual feedback with highlighted points

### ⚙️ Smart Tools

* Grid display toggle
* Grid snapping (with Shift or toggle)
* Angle snapping (45° constraint)
* Zoom in/out and reset

### 🕘 History Management

* Undo (Ctrl + Z)
* Redo (Ctrl + Y)
* Action history tracking

### 💾 Autosave

* Automatically saves data in browser (localStorage)
* Restores previous session on reload

### 📤 Export Options

* Export as **SVG**
* Export as **JSON**
* Export as **PNG**

### 📊 Status & Feedback

* Real-time mouse coordinates
* Polyline and point count
* Toast notifications for actions
* Angle indicator while drawing

### ♿ Accessibility

* Keyboard shortcuts for all major actions
* ARIA labels for screen readers
* Skip navigation support

---

## ⌨️ Keyboard Shortcuts

| Key      | Action          |
| -------- | --------------- |
| B        | Draw Mode       |
| M        | Move Mode       |
| D        | Delete Mode     |
| Ctrl + Z | Undo            |
| Ctrl + Y | Redo            |
| Shift    | Angle Snap      |
| G        | Toggle Grid     |
| S        | Toggle Snap     |
| + / -    | Zoom            |
| 0        | Reset Zoom      |
| Esc      | Finish Polyline |
| Q        | Clear All       |
| ?        | Help            |
| Ctrl + S | Export          |

---

## 🛠️ Technologies Used

* **HTML5** – Structure
* **CSS3** – Styling and UI design
* **JavaScript (Vanilla)** – Logic and interactivity
* **Canvas API** – Rendering graphics
* **LocalStorage** – Data persistence

---

## 📂 Project Structure

```
project-folder/
│
├── index.html   # Main application file (HTML, CSS, JS combined)
└── README.md    # Project documentation
```

---

## 🚀 How to Run

1. Download or clone the project
2. Open the HTML file in your browser:

```bash
open index.html
```

No installation or dependencies required.

---

## 🧠 HCI Concepts Used

### 1. Direct Manipulation

Users interact directly with objects (points, lines) on the canvas.

### 2. Feedback

* Visual highlights
* Toast messages
* Status bar updates

### 3. Constraints

* Grid snapping
* Angle snapping (45°)

### 4. Undo/Redo (Reversibility)

Allows users to recover from mistakes.

### 5. Visibility of System Status

* Mode indicator (Draw/Move/Delete)
* Mouse coordinates
* Polyline count

### 6. Consistency

* Same interaction patterns across modes
* Uniform UI components

### 7. Accessibility

* Keyboard shortcuts
* ARIA labels for screen readers

---

## 📈 Possible Improvements

* Add touch support for mobile devices
* Save/export to cloud
* Add polygon fill option
* Layer management system
* Multi-select and group editing
