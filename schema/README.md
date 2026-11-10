# Upload schema examples

These are editable examples of Oja AI's current metadata contract, not formal JSON Schema specifications. Every `.json` file is valid JSON: do not paste comments, this guide, or several example objects together into a JSON field. Replace illustrative declarations with accurate information about your own files and license.

## Which file goes where?

| File | Use | Upload form field |
| --- | --- | --- |
| [dataset_schema_example.json](dataset_schema_example.json) | One unsplit dataset; decide percentages later | Splits and features (JSON) |
| [dataset_80_20_example.json](dataset_80_20_example.json) | One unsplit dataset; propose train/test percentages | Splits and features (JSON) |
| [dataset_separate_files_example.json](dataset_separate_files_example.json) | Separate files for predefined partitions | Splits and features (JSON) |
| [dataset_split_column_example.json](dataset_split_column_example.json) | One file whose records contain partition assignments | Splits and features (JSON) |
| [model_schema_example.json](model_schema_example.json) | Full model metadata object | Model schema (JSON), then Apply schema to fields |

The model example contains the whole model metadata object. Dataset examples contain only `splits` and `features`; complete the dataset license, task, intended use, limitations, modality, collection method, personal-data declaration, card, changelog and rights confirmation in their separate form fields. **Save metadata** stores changes. Upload actual data/model files separately; pasting JSON does not upload weights or generate data partitions.

## Dataset workflow

1. In Upload Data, create/select a repository and draft version.
2. Choose the example matching how your dataset is organized. Upload and validate data files before saving a predefined file/column configuration.
3. Copy the entire JSON object into Splits and features (JSON). Keep `features` appropriate for your data.
4. Replace example artifact UUIDs with IDs shown under Files, then Save metadata. Publish only after required metadata and files pass validation.

### No predefined splits

`dataset_schema_example.json` uses `status: "not_provided"`, `method: "user_defined"`, and `ratios: null`. This explicitly records that percentages have not been selected. Later, replace null with, for example:

```json
{"train": 70, "validation": 15, "test": 15}
```

or:

```json
{"train": 80, "test": 20}
```

Percentages must be positive JSON numbers totaling 100; train and test are required when percentages are supplied. Omit validation for a two-way split. Do not quote numbers or use zero for an omitted partition. The configuration does not physically split or shuffle records. Published metadata is immutable: create a new version to change its declaration.

### Separate partition files

Replace `11111111-...`, `22222222-...`, and `33333333-...` with the actual **artifact IDs** of train, validation and test files attached to this exact version. For train/test only, remove the `validation` entry. Different partitions must reference different files. Exact relative paths such as `train.csv` are accepted and converted to artifact IDs when saved. Percentages must stay null or be omitted for predefined splits.

### A partition column

Set `file` to your dataset artifact ID, `column` to the actual column name, and `values` to the values used in that column. For example, `"validation": "Valid"` means rows labeled `Valid` belong to validation. These names and values are case-sensitive. Remove the validation mapping if absent. Do not add a nonexistent `split` column to the metadata and assume it exists in the uploaded data.

The backend verifies the actual header/schema in CSV, TSV, JSON, JSONL or Parquet. It does not inspect all records to verify every partition assignment. When exactly one supported data file is attached, `file` may be omitted; otherwise specify it explicitly.

### Features and old count dictionaries

Each feature requires a name and dtype; description is optional. Change or remove the customer-churn demonstration columns to match your dataset. `"features": []` is valid when a column schema does not apply. Do not add unsupported fields such as `role` or `classes`; describe those semantics in the feature description or dataset card.

Older `"splits": {"train": 70, "test": 30}` metadata remains accepted as declared example **counts**, not percentages. Use `ratios` inside a `user_defined` configuration for percentages.

## Model workflow

1. In Upload Model, create/select a model repository and draft version.
2. Copy `model_schema_example.json` into Model schema (JSON). Replace the illustrative architecture, training description, intended use, limitations, tags and other declarations with the truth about your model.
3. Click Apply schema to fields, complete the model card, changelog and rights confirmation, then Save metadata.
4. Upload weights and supporting configuration/documentation files; wait for validation, then publish.

Required model metadata: `license`, `task`, `intended_use`, `limitations`, `framework`, `architecture`, `training_description`. Supported framework identifiers: `pytorch`, `tensorflow`, `onnx`, `jax`, `other`.

`source_url`, `code_url`, `code_revision` and `methods` are optional; blank example URLs may be left blank or removed. `languages` and `tags` may be empty arrays. Optional `parameter_count` may be added as a nonnegative integer when known; omit it if unknown. `LicenseRef-Custom` requires a valid `license_url`. The example's Apache license is illustrative: select the actual license you can grant.

Both upload forms have **Citation (optional)**. Enter a real citation, DOI/link, or BibTeX (fenced as a Markdown code block if desired). It is saved as `metadata.citation` and displayed under Provenance. The model JSON example includes an empty citation for you to replace or omit. Dataset split examples only contain splits/features: enter citation in the separate form field. No citation is generated automatically. Existing citation text inside a Markdown model/dataset card comes from the contributor's card and is displayed independently; editing a new citation field does not rewrite old published cards.

Do not put dataset `splits`/`features`, a release `card`, `sources`, `changelog`, or `rights_confirmed` inside model metadata. Model input/output signatures, runtime settings and metrics are not currently accepted structured keys; document these in the Markdown model card.

## Artifact IDs versus upstream release IDs

Dataset `splits.files` and `splits.file` refer to **artifact IDs** in the current draft. Exact upstream releases (JSON) refers to **published release IDs**, separately:

```json
[{"source": "REPLACE_WITH_A_REAL_PUBLISHED_RELEASE_UUID", "relation": "trained_on"}]
```

Use `trained_on` for a model's training dataset release, or `derived_from` for derivation. Use `[]` for an original upload without upstream platform releases. Do not use artifact IDs or paste this provenance array into the model/dataset schema field.

Complete API request bodies are provided in [docs/examples](../docs/examples), and further details in [dataset splits](../docs/dataset-splits.md) and [model metadata](../docs/model-metadata.md).
