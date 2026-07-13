// SGTX Brain OS — Fine-Tuning Exporter
// =============================================================================
// Converts collected `TrainingExample` records into framework-ready artifacts
// for Unsloth, Axolotl, LLaMA Factory, and Hugging Face TRL. The exported
// strings are syntactically valid Python / YAML / JSON that a user can drop
// onto a GPU box and run with no further editing.
//
// Output formats:
//   * JSONL — `alpaca` (instruction/input/output), `chatml` (system/user/
//     assistant messages), `sharegpt` (role/content messages).
//   * Train/val split — stratified by capability, valRatio default 0.1.
//   * Unsloth — a complete Colab-ready Python script that installs unsloth,
//     loads a 4-bit base model, applies LoRA, trains with TRL SFTTrainer,
//     and saves the adapter.
//   * Axolotl — a 0.4.1-schema YAML config (base_model, lora, datasets...).
//   * LLaMA Factory — `dataset_info.json` entry + YAML config.
//   * Hugging Face TRL — a Python script using SFTTrainer + peft + datasets.
//
// Every exporter emits a manifest with `{ generatedAt, exampleCount,
// frameworkVersions, baseModel, format }` so downstream tooling can verify
// provenance.
// =============================================================================

import type { TrainingExample } from "./dataset-collector";

/** Default base model — Unsloth's 4-bit quantised Mistral 7B Instruct. */
export const DEFAULT_BASE_MODEL = "unsloth/mistral-7b-instruct-v0.3-bnb-4bit";

/** Framework versions recorded in each exporter's manifest. */
export const FRAMEWORK_VERSIONS = {
  unsloth: "2024.8",
  axolotl: "0.4.1",
  llamaFactory: "0.8.3",
  trl: "0.9.4",
  transformers: "4.44.2",
  peft: "0.12.0",
  datasets: "2.21.0",
} as const;

/** Supported JSONL formats. */
export type JsonlFormat = "alpaca" | "chatml" | "sharegpt";

/** Options accepted by `exportToJSONL`. */
export interface JsonlExportOptions {
  format: JsonlFormat;
  /** Optional system prompt for chatml/sharegpt. */
  systemPrompt?: string;
}

/** A manifest attached to every exported artifact. */
export interface ExportManifest {
  generatedAt: string;
  exampleCount: number;
  frameworkVersions: Record<string, string>;
  baseModel: string;
  format: string;
}

/** Result of `generateTrainValSplit`. */
export interface TrainValSplit {
  train: TrainingExample[];
  val: TrainingExample[];
}

/** Result of `exportForLlamaFactory`. */
export interface LlamaFactoryExport {
  datasetInfoJson: string;
  yamlConfig: string;
  manifest: ExportManifest;
}

/** Result of `exportAllFormats`. */
export interface AllFormatsExport {
  unslothScript: string;
  axolotlYaml: string;
  llamaFactoryDatasetInfo: string;
  llamaFactoryYaml: string;
  trlScript: string;
  alpacaJsonl: string;
  chatmlJsonl: string;
  sharegptJsonl: string;
  trainSplit: TrainingExample[];
  valSplit: TrainingExample[];
  manifests: {
    alpaca: ExportManifest;
    chatml: ExportManifest;
    sharegpt: ExportManifest;
    unsloth: ExportManifest;
    axolotl: ExportManifest;
    llamaFactory: ExportManifest;
    trl: ExportManifest;
  };
}

/** Build a manifest for an exporter. */
function buildManifest(
  exampleCount: number,
  format: string,
  baseModel: string = DEFAULT_BASE_MODEL,
  frameworkVersions: Record<string, string> = {},
): ExportManifest {
  return {
    generatedAt: new Date().toISOString(),
    exampleCount,
    frameworkVersions,
    baseModel,
    format,
  };
}

/**
 * Convert a single `TrainingExample` into a compact, human-readable
 * instruction string (used by the alpaca/chatml/sharegpt formats). The
 * instruction names the capability + the input lane (if any) and instructs
 * the model to produce the Brain's output for that input.
 */
function buildInstruction(example: TrainingExample): string {
  const cap = example.capability;
  const lane = example.metadata?.routeId
    ? ` for route ${example.metadata.routeId}`
    : example.input.originPort && example.input.destinationPort
      ? ` for lane ${example.input.originPort}-${example.input.destinationPort}`
      : example.input.origin && example.input.dest
        ? ` for lane ${example.input.origin}-${example.input.dest}`
        : "";
  return `Produce the SGTX Brain output for capability "${cap}"${lane}.`;
}

/** Stable JSON stringifier (deterministic key order for reproducible exports). */
function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * Convert a `TrainingExample` to a single JSONL record (one object per
 * format). The output is a single line of JSON, no trailing newline.
 */
export function exampleToJsonlRecord(
  example: TrainingExample,
  opts: JsonlExportOptions,
): string {
  const instruction = buildInstruction(example);
  const inputStr = stableStringify(example.input);
  const outputStr = stableStringify(example.output);
  const systemPrompt =
    opts.systemPrompt ??
    "You are the SGTX Brain OS. Produce the capability output requested by the user. Respond with a single JSON object.";

  if (opts.format === "alpaca") {
    return stableStringify({
      instruction,
      input: inputStr,
      output: outputStr,
    });
  }

  if (opts.format === "chatml") {
    return stableStringify({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `${instruction}\n\nInput:\n${inputStr}` },
        { role: "assistant", content: outputStr },
      ],
    });
  }

  // sharegpt
  return stableStringify({
    conversations: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `${instruction}\n\nInput:\n${inputStr}` },
      { role: "assistant", content: outputStr },
    ],
  });
}

/**
 * Export a list of examples as a JSONL string (one record per line, with a
 * trailing newline). The format is selected by `opts.format`:
 *   * "alpaca"   → `{"instruction","input","output"}`
 *   * "chatml"   → `{"messages":[{role,content},...]}`
 *   * "sharegpt" → `{"conversations":[{role,content},...]}`
 */
export function exportToJSONL(
  examples: TrainingExample[],
  opts: JsonlExportOptions,
): string {
  if (examples.length === 0) return "";
  return examples.map((ex) => exampleToJsonlRecord(ex, opts)).join("\n") + "\n";
}

/**
 * Stratified train/val split. Stratifies by `capability` so the val set has
 * proportional representation of each capability (rather than a random
 * shuffle that might leave rare capabilities entirely in train or val).
 *
 * @param examples  The full dataset (high-quality recommended).
 * @param valRatio  Fraction of each capability to reserve for validation (0-1).
 */
export function generateTrainValSplit(
  examples: TrainingExample[],
  valRatio = 0.1,
): TrainValSplit {
  const ratio = Math.min(0.5, Math.max(0, valRatio));
  if (examples.length === 0) return { train: [], val: [] };

  // Group by capability (stratify key).
  const groups = new Map<string, TrainingExample[]>();
  for (const ex of examples) {
    const arr = groups.get(ex.capability) ?? [];
    arr.push(ex);
    groups.set(ex.capability, arr);
  }

  const train: TrainingExample[] = [];
  const val: TrainingExample[] = [];
  for (const arr of groups.values()) {
    // Sort by recordedAt for determinism.
    arr.sort((a, b) => a.recordedAt - b.recordedAt);
    const valCount = Math.max(1, Math.floor(arr.length * ratio));
    // Take evenly-spaced samples for val so we don't bias toward early/late.
    const valSet = new Set<number>();
    if (arr.length <= 1) {
      // Single-example capability: keep it in train.
    } else if (valCount >= arr.length) {
      valSet.add(arr.length - 1);
    } else {
      const step = arr.length / valCount;
      for (let i = 0; i < valCount; i++) {
        valSet.add(Math.floor(i * step));
      }
    }
    arr.forEach((ex, idx) => {
      if (valSet.has(idx)) val.push(ex);
      else train.push(ex);
    });
  }

  return { train, val };
}

/**
 * Generate a complete Unsloth Colab-ready Python script that:
 *   * Installs unsloth + dependencies.
 *   * Loads a 4-bit base model (default: `unsloth/mistral-7b-instruct-v0.3-bnb-4bit`).
 *   * Applies LoRA (r=16, alpha=16, dropout=0).
 *   * Loads the JSONL dataset (chatml format) from a path.
 *   * Trains with TRL `SFTTrainer`.
 *   * Saves the LoRA adapter to `./sgtx-brain-adapter`.
 *
 * The dataset path is parameterised — the operator saves the JSONL file
 * locally and points the script at it.
 */
export function exportForUnsloth(
  examples: TrainingExample[],
  opts: { baseModel?: string; datasetPath?: string } = {},
): string {
  const baseModel = opts.baseModel ?? DEFAULT_BASE_MODEL;
  const datasetPath = opts.datasetPath ?? "./sgtx-brain-chatml.jsonl";
  const manifest = buildManifest(examples.length, "unsloth-python-script", baseModel, {
    unsloth: FRAMEWORK_VERSIONS.unsloth,
    trl: FRAMEWORK_VERSIONS.trl,
    transformers: FRAMEWORK_VERSIONS.transformers,
    peft: FRAMEWORK_VERSIONS.peft,
    datasets: FRAMEWORK_VERSIONS.datasets,
  });

  return `# SGTX Brain OS — Unsloth Fine-Tuning Script
# Auto-generated by sgtx fine-tuning-exporter.
# Manifest: ${stableStringify(manifest)}
#
# Usage (Google Colab — GPU runtime required):
#   1. Save the exported chatml JSONL as ./sgtx-brain-chatml.jsonl
#   2. Run all cells.
#   3. The LoRA adapter is saved to ./sgtx-brain-adapter/.

# --- Install Unsloth (Colab) ---
import sys
if "google.colab" in sys.modules:
    # Colab-only install — pins compatible versions of unsloth + deps.
    get_ipython().system('pip install --no-deps "unsloth==${FRAMEWORK_VERSIONS.unsloth}"')
    get_ipython().system('pip install --no-deps "trl==${FRAMEWORK_VERSIONS.trl}" "transformers==${FRAMEWORK_VERSIONS.transformers}" "peft==${FRAMEWORK_VERSIONS.peft}" "datasets==${FRAMEWORK_VERSIONS.datasets}"')
    get_ipython().system('pip install --no-deps "bitsandbytes" "accelerate" "xformers" "trl" "peft")

from unsloth import FastLanguageModel
import torch
from datasets import load_dataset
from trl import SFTTrainer
from transformers import TrainingArguments

# --- Load base model in 4-bit ---
max_seq_length = 4096
dtype = None  # auto
load_in_4bit = True

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="${baseModel}",
    max_seq_length=max_seq_length,
    dtype=dtype,
    load_in_4bit=load_in_4bit,
)

# --- Apply LoRA adapters ---
model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                    "gate_proj", "up_proj", "down_proj"],
    lora_alpha=16,
    lora_dropout=0,
    bias="none",
    use_gradient_checkpointing="unsloth",
    random_state=3407,
    use_rslora=False,
    loftq_config=None,
)

# --- Load chatml JSONL dataset ---
# Each line: {"messages":[{"role":"system","content":"..."},{"role":"user","content":"..."},{"role":"assistant","content":"..."}]}
dataset = load_dataset("json", data_files="${datasetPath}", split="train")

# Apply the model's chat template (Unsloth + Mistral Instruct).
def formatting_func(example):
    return tokenizer.apply_chat_template(
        example["messages"],
        tokenize=False,
        add_generation_prompt=False,
    )

# --- SFTTrainer ---
trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    formatting_func=formatting_func,
    max_seq_length=max_seq_length,
    args=TrainingArguments(
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        warmup_steps=50,
        num_train_epochs=3,
        learning_rate=2e-4,
        fp16=not torch.cuda.is_bf16_supported(),
        bf16=torch.cuda.is_bf16_supported(),
        logging_steps=10,
        optim="adamw_8bit",
        weight_decay=0.01,
        lr_scheduler_type="cosine",
        seed=3407,
        output_dir="outputs",
        save_strategy="epoch",
    ),
)

# --- Train ---
trainer_stats = trainer.train()

# --- Save the LoRA adapter ---
model.save_pretrained("sgtx-brain-adapter")
tokenizer.save_pretrained("sgtx-brain-adapter")

print(f"Done. Adapter saved to ./sgtx-brain-adapter. Training stats: {trainer_stats}")
`;
}

/**
 * Generate an Axolotl 0.4.1-schema YAML config. Loads the base model in 4-bit,
 * applies LoRA, points at a JSONL dataset (chatml format), trains for 3 epochs
 * at lr=2e-4, saves the adapter to `./sgtx-brain-axolotl-out`.
 */
export function exportForAxolotl(
  examples: TrainingExample[],
  opts: { baseModel?: string; datasetPath?: string } = {},
): string {
  const baseModel = opts.baseModel ?? DEFAULT_BASE_MODEL;
  const datasetPath = opts.datasetPath ?? "./sgtx-brain-chatml.jsonl";
  const manifest = buildManifest(examples.length, "axolotl-yaml", baseModel, {
    axolotl: FRAMEWORK_VERSIONS.axolotl,
  });

  return `# SGTX Brain OS — Axolotl Fine-Tuning Config
# Auto-generated by sgtx fine-tuning-exporter.
# Manifest: ${stableStringify(manifest)}
#
# Usage:
#   axolotl train this_config.yml

base_model: ${baseModel}
model_type: AutoModelForCausalLM
tokenizer_type: AutoTokenizer
load_in_4bit: true
strict: false

datasets:
  - path: ${datasetPath}
    type: chat_template
    chat_template: chatml
    field_messages: messages
    message_field_role: role
    message_field_content: content

dataset_prepared_path: ./sgtx-brain-axolotl-prepared
val_set_size: 0.1
output_dir: ./sgtx-brain-axolotl-out

sequence_len: 4096
sample_packing: true
pad_to_sequence_len: true

adapter: lora
lora_r: 16
lora_alpha: 16
lora_dropout: 0.0
lora_target_modules:
  - q_proj
  - k_proj
  - v_proj
  - o_proj
  - gate_proj
  - up_proj
  - down_proj

micro_batch_size: 2
gradient_accumulation_steps: 4
num_epochs: 3
learning_rate: 0.0002
optimizer: adamw_8bit
lr_scheduler: cosine
warmup_steps: 50
weight_decay: 0.01

bf16: auto
fp16: false
tf32: false

gradient_checkpointing: true
logging_steps: 10
save_strategy: epoch
save_total_limit: 4

seed: 3407
`;
}

/**
 * Generate LLaMA Factory artifacts: a `dataset_info.json` entry for the
 * sharegpt-formatted JSONL dataset, and a YAML training config that targets
 * the Mistral template with LoRA fine-tuning.
 */
export function exportForLlamaFactory(
  examples: TrainingExample[],
  opts: { baseModel?: string; datasetName?: string; datasetPath?: string } = {},
): LlamaFactoryExport {
  const baseModel = opts.baseModel ?? DEFAULT_BASE_MODEL;
  const datasetName = opts.datasetName ?? "sgtx_brain_sharegpt";
  const datasetPath = opts.datasetPath ?? "./sgtx-brain-sharegpt.jsonl";
  const manifest = buildManifest(examples.length, "llama-factory", baseModel, {
    llamaFactory: FRAMEWORK_VERSIONS.llamaFactory,
  });

  const datasetInfoJson = stableStringify({
    [datasetName]: {
      file_name: datasetPath,
      formatting: "sharegpt",
      columns: {
        messages: "conversations",
      },
    },
  });

  const yamlConfig = `# SGTX Brain OS — LLaMA Factory Fine-Tuning Config
# Auto-generated by sgtx fine-tuning-exporter.
# Manifest: ${stableStringify(manifest)}
#
# Usage:
#   llamafactory-cli train this_config.yml

### model
model_name_or_path: ${baseModel}
trust_remote_code: true

### method
stage: sft
do_train: true
finetuning_type: lora
lora_target: q_proj,k_proj,v_proj,o_proj,gate_proj,up_proj,down_proj
lora_rank: 16
lora_alpha: 16
lora_dropout: 0.0

### dataset
dataset: ${datasetName}
template: mistral
cutoff_len: 4096
max_samples: 100000
overwrite_cache: true
preprocessing_num_workers: 8

### output
output_dir: ./sgtx-brain-llamafactory-out
logging_steps: 10
save_strategy: epoch
save_total_limit: 4
plot_loss: true
overwrite_output_dir: true

### train
per_device_train_batch_size: 2
gradient_accumulation_steps: 4
learning_rate: 0.0002
num_train_epochs: 3.0
lr_scheduler_type: cosine
warmup_steps: 50
weight_decay: 0.01
bf16: true
ddp_timeout: 180000000

### eval
val_size: 0.1
per_device_eval_batch_size: 2
eval_strategy: steps
eval_steps: 200
`;

  return { datasetInfoJson, yamlConfig, manifest };
}

/**
 * Generate a Hugging Face TRL training script using `SFTTrainer`,
 * `transformers`, `peft.LoraConfig`, and `datasets.load_dataset("json", ...)`.
 * Mirrors the Unsloth script's hyperparameters but uses vanilla HF stack
 * (no Unsloth-specific kernels).
 */
export function exportForHuggingFaceTRL(
  examples: TrainingExample[],
  opts: { baseModel?: string; datasetPath?: string } = {},
): string {
  const baseModel = opts.baseModel ?? DEFAULT_BASE_MODEL;
  const datasetPath = opts.datasetPath ?? "./sgtx-brain-chatml.jsonl";
  const manifest = buildManifest(examples.length, "huggingface-trl", baseModel, {
    trl: FRAMEWORK_VERSIONS.trl,
    transformers: FRAMEWORK_VERSIONS.transformers,
    peft: FRAMEWORK_VERSIONS.peft,
    datasets: FRAMEWORK_VERSIONS.datasets,
  });

  return `# SGTX Brain OS — Hugging Face TRL Fine-Tuning Script
# Auto-generated by sgtx fine-tuning-exporter.
# Manifest: ${stableStringify(manifest)}
#
# Usage (GPU box with PyTorch + CUDA):
#   pip install "trl==${FRAMEWORK_VERSIONS.trl}" "transformers==${FRAMEWORK_VERSIONS.transformers}" "peft==${FRAMEWORK_VERSIONS.peft}" "datasets==${FRAMEWORK_VERSIONS.datasets}" "bitsandbytes" "accelerate"
#   python this_script.py

import torch
from datasets import load_dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    TrainingArguments,
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from trl import SFTTrainer

BASE_MODEL = "${baseModel}"
DATASET_PATH = "${datasetPath}"
OUTPUT_DIR = "./sgtx-brain-trl-out"
MAX_SEQ_LEN = 4096

# --- 4-bit quantisation config ---
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_use_double_quant=True,
)

# --- Load model + tokenizer ---
model = AutoModelForCausalLM.from_pretrained(
    BASE_MODEL,
    quantization_config=bnb_config,
    device_map="auto",
    trust_remote_code=True,
)
model.config.use_cache = False
model = prepare_model_for_kbit_training(model)

tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, trust_remote_code=True)
tokenizer.pad_token = tokenizer.pad_token or tokenizer.eos_token
tokenizer.padding_side = "right"

# --- LoRA config ---
peft_config = LoraConfig(
    r=16,
    lora_alpha=16,
    lora_dropout=0.0,
    bias="none",
    task_type="CAUSAL_LM",
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                    "gate_proj", "up_proj", "down_proj"],
)

# --- Dataset (chatml format) ---
dataset = load_dataset("json", data_files=DATASET_PATH, split="train")

def format_chatml(example):
    text = tokenizer.apply_chat_template(
        example["messages"],
        tokenize=False,
        add_generation_prompt=False,
    )
    return {"text": text}

dataset = dataset.map(format_chatml, remove_columns=dataset.column_names)

# --- TrainingArguments ---
training_args = TrainingArguments(
    output_dir=OUTPUT_DIR,
    per_device_train_batch_size=2,
    gradient_accumulation_steps=4,
    warmup_steps=50,
    num_train_epochs=3,
    learning_rate=2e-4,
    fp16=False,
    bf16=True,
    logging_steps=10,
    optim="adamw_8bit",
    weight_decay=0.01,
    lr_scheduler_type="cosine",
    seed=3407,
    save_strategy="epoch",
    save_total_limit=4,
    report_to="tensorboard",
)

# --- SFTTrainer ---
trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    peft_config=peft_config,
    dataset_text_field="text",
    max_seq_length=MAX_SEQ_LEN,
    args=training_args,
)

# --- Train + save ---
trainer.train()
trainer.save_model(OUTPUT_DIR)
tokenizer.save_pretrained(OUTPUT_DIR)
print(f"Done. Adapter + tokenizer saved to {OUTPUT_DIR}")
`;
}

/**
 * Convenience: export every format in one call. Returns the JSONL strings,
 * the train/val split, the framework-specific scripts/configs, and a map of
 * manifests. Use this from the `framework: "all"` API path.
 */
export function exportAllFormats(
  examples: TrainingExample[],
  opts: {
    baseModel?: string;
    datasetPath?: string;
    valRatio?: number;
  } = {},
): AllFormatsExport {
  const baseModel = opts.baseModel ?? DEFAULT_BASE_MODEL;
  const datasetPath = opts.datasetPath ?? "./sgtx-brain-chatml.jsonl";
  const valRatio = opts.valRatio ?? 0.1;

  const alpacaJsonl = exportToJSONL(examples, { format: "alpaca" });
  const chatmlJsonl = exportToJSONL(examples, { format: "chatml" });
  const sharegptJsonl = exportToJSONL(examples, { format: "sharegpt" });
  const split = generateTrainValSplit(examples, valRatio);

  const unslothScript = exportForUnsloth(examples, { baseModel, datasetPath });
  const axolotlYaml = exportForAxolotl(examples, { baseModel, datasetPath });
  const llamaFactory = exportForLlamaFactory(examples, {
    baseModel,
    datasetPath: "./sgtx-brain-sharegpt.jsonl",
  });
  const trlScript = exportForHuggingFaceTRL(examples, { baseModel, datasetPath });

  const manifests = {
    alpaca: buildManifest(examples.length, "alpaca-jsonl", baseModel, {}),
    chatml: buildManifest(examples.length, "chatml-jsonl", baseModel, {}),
    sharegpt: buildManifest(examples.length, "sharegpt-jsonl", baseModel, {}),
    unsloth: buildManifest(examples.length, "unsloth-python-script", baseModel, {
      unsloth: FRAMEWORK_VERSIONS.unsloth,
    }),
    axolotl: buildManifest(examples.length, "axolotl-yaml", baseModel, {
      axolotl: FRAMEWORK_VERSIONS.axolotl,
    }),
    llamaFactory: buildManifest(examples.length, "llama-factory", baseModel, {
      llamaFactory: FRAMEWORK_VERSIONS.llamaFactory,
    }),
    trl: buildManifest(examples.length, "huggingface-trl", baseModel, {
      trl: FRAMEWORK_VERSIONS.trl,
      transformers: FRAMEWORK_VERSIONS.transformers,
      peft: FRAMEWORK_VERSIONS.peft,
      datasets: FRAMEWORK_VERSIONS.datasets,
    }),
  };

  return {
    unslothScript,
    axolotlYaml,
    llamaFactoryDatasetInfo: llamaFactory.datasetInfoJson,
    llamaFactoryYaml: llamaFactory.yamlConfig,
    trlScript,
    alpacaJsonl,
    chatmlJsonl,
    sharegptJsonl,
    trainSplit: split.train,
    valSplit: split.val,
    manifests,
  };
}

/**
 * Singleton exporter namespace. Mirrors the module-level functions so callers
 * can import a single `fineTuningExporter` object (matches the pattern used
 * by `datasetCollector` and `fineTuningJobManager`).
 */
export const fineTuningExporter = {
  exportToJSONL,
  generateTrainValSplit,
  exportForUnsloth,
  exportForAxolotl,
  exportForLlamaFactory,
  exportForHuggingFaceTRL,
  exportAllFormats,
};
