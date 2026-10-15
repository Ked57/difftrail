# Difftrail

Terms for identifying repository files that may be affected by a selected change.

## Language

**Changed-file seed**:
A repository path identified as changed by a comparison and supplied to impact analysis. Seeds include deleted paths and both the old and new paths of a renamed file.
_Avoid_: Impacted file when referring only to an input path

**Impacted file**:
A changed-file seed or a repository file that directly or transitively depends on one, regardless of file purpose or extension. Dependencies include imports, explicit local file references, statically resolved auto-import mappings, and configuration or metadata used to analyze or resolve the consuming file.
_Avoid_: Affected test when referring to the general file set

**Analysis gap**:
A detected inability to analyze an input or establish a dependency relationship required by Difftrail's supported static dependency model. It prevents a successful impact result.
_Avoid_: No impact when analysis could not determine impact

**Returned file**:
An impacted file present in the selected head snapshot and retained after result filtering. Removed impacted paths are reported separately.
_Avoid_: Complete impact set when referring only to surviving returned files

**Removed impacted path**:
An impacted repository path absent from the selected head snapshot, including a deleted path or a former path of a renamed file.
_Avoid_: Ignored file
