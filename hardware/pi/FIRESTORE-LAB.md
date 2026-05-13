# Firestore + Raspberry Pi service account (lab)

## 1) Admin SDK does **not** use `firestore.rules`

The Python scripts on the Pi (**`serial_bridge.py`**, **`kiosk_worker.py`**, **`barcode_hid_to_kiosk.py`**) use the **Firebase Admin SDK** with a **service account JSON**. Those writes are authorized by **Google Cloud IAM** on the service account, **not** by Firestore Security Rules.

So:

- Tightening **`firestore.rules`** does **not** block the Pi by itself.
- To restrict the Pi, use a **dedicated service account** with only the roles it needs (see below).

## 2) Least-privilege IAM (recommended)

In **Google Cloud Console** → **IAM** (for the same project as Firebase):

1. Create a **new** service account, e.g. `smartlib-pi-edge`.
2. Grant minimal roles, for example:
   - **Cloud Datastore User** (or **Firebase Admin** only if you must — broader than needed), **or**
   - Custom role with `datastore.documents.get/create/update` on required collections only (advanced).
3. Create a **new JSON key** for that account and put it on the Pi at the path in **`firebase_credentials_path`**.
4. **Disable or delete** old keys if they were ever exposed.

## 3) Security rules (for **web / mobile client SDK**)

Rules still protect **browser** users. You can **deny** direct client read/write on lab-only collections so only the Pi (Admin) writes them.

Merge something like this into your existing **`firestore.rules`** (adjust if your app legitimately reads these from the client):

```text
match /kiosk_auth_events/{id} {
  allow read, write: if false;
}
```

If the website must show `kiosk_auth_events` to staff, replace with `request.auth != null` + your custom claims.

## 4) Audit

Firebase Console → **Firestore** → usage; GCP → **Logging** → filter by service account email to see who wrote what.
