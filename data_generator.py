
import csv
import json
import random
from pathlib import Path

# Reproducible synthetic dataset generator
random.seed(42)

OUTPUT = Path("customer_churn_demo")
OUTPUT.mkdir(exist_ok=True)

records = []

for i in range(1, 101):
    age = random.randint(18, 70)
    monthly_charges = round(random.uniform(25, 120), 2)
    tenure = random.randint(1, 72)

    contract_type = random.choices(
        ["monthly", "yearly", "two_year"],
        weights=[0.50, 0.30, 0.20]
    )[0]

    # Synthetic churn probability
    probability = 0.15
    probability += 0.25 if contract_type == "monthly" else 0
    probability += 0.15 if tenure <= 6 else 0
    probability += 0.10 if monthly_charges > 90 else 0
    probability -= 0.15 if contract_type == "two_year" else 0
    probability = max(0.05, min(0.90, probability))

    churn = "yes" if random.random() < probability else "no"

    records.append({
        "customer_id": f"CUST{i:04d}",
        "age": age,
        "monthly_charges": monthly_charges,
        "tenure": tenure,
        "contract_type": contract_type,
        "churn": churn
    })

columns = [
    "customer_id",
    "age",
    "monthly_charges",
    "tenure",
    "contract_type",
    "churn"
]

# Save complete dataset
with open(OUTPUT / "customer_churn.csv", "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=columns)
    writer.writeheader()
    writer.writerows(records)

# Shuffle deterministically and create splits
random.Random(42).shuffle(records)

splits = {
    "train": records[:70],
    "validation": records[70:85],
    "test": records[85:100]
}

for split_name, split_records in splits.items():
    with open(OUTPUT / f"{split_name}.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        writer.writerows(split_records)

# Generate split and feature metadata
schema = {
    "splits": {
        "train": {
            "file": "train.csv",
            "num_examples": 70
        },
        "validation": {
            "file": "validation.csv",
            "num_examples": 15
        },
        "test": {
            "file": "test.csv",
            "num_examples": 15
        }
    },
    "features": [
        {"name": "customer_id", "dtype": "string", "role": "identifier"},
        {"name": "age", "dtype": "integer", "role": "feature"},
        {"name": "monthly_charges", "dtype": "float", "role": "feature"},
        {"name": "tenure", "dtype": "integer", "role": "feature"},
        {"name": "contract_type", "dtype": "string", "role": "feature"},
        {"name": "churn", "dtype": "string", "role": "target",
         "classes": ["yes", "no"]}
    ]
}

with open(OUTPUT / "schema.json", "w") as f:
    json.dump(schema, f, indent=2)

print("Dataset generation complete!")
print(f"Total records: {len(records)}")
print("Training: 70")
print("Validation: 15")
print("Testing: 15")
print(f"Files saved in: {OUTPUT.resolve()}")
