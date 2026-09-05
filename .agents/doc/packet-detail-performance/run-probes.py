"""Run native storage/runtime comparisons without modifying the source capture.

Build packages/core/cpp/build first. Pass a Pruftnet spool segment as argv[1].
This local benchmark harness uses a Unix C++ compiler and libpcap linker flags.
"""
import pathlib
import subprocess
import sys
import tempfile

root = pathlib.Path(__file__).resolve().parents[3]
output = pathlib.Path(__file__).resolve().parent
baseline = "a9936b5254800c4bdda6cf201a9646df7b0ca075"
cpp = root / "packages/core/cpp"


def previous(path):
    return subprocess.check_output(
        ["git", "show", f"{baseline}:packages/core/cpp/{path}"], cwd=root, text=True
    )


with tempfile.TemporaryDirectory(prefix="pruftnet-detail-probes-") as directory:
    temporary = pathlib.Path(directory)
    legacy = temporary / "legacy.cpp"
    legacy.write_text(previous("src/capture/pcapng_format.cpp").replace(
        "namespace pruftnet::capture::internal", "namespace pruftnet::capture::legacy"
    ))
    old_runtime = temporary / "runtime.cpp"
    old_runtime.write_text(previous("src/sniffing/sniffer_runtime.cpp"))
    includes = [f"-I{cpp}", f"-I{cpp / 'src'}", f"-I{cpp / 'include'}"]
    for name, source, extra, arguments in [
        ("runtime-baseline", "runtime-probe.cpp", [str(old_runtime)], []),
        ("runtime-updated", "runtime-probe.cpp", [], []),
        ("storage-results", "storage-probe.cpp", [str(legacy)], [sys.argv[1]]),
    ]:
        executable = temporary / name
        subprocess.run([
            "c++", "-std=c++20", *includes, str(output / source), *extra,
            str(cpp / "build/libpruftnet_sniffing.a"), "-lpcap", "-o", str(executable),
        ], check=True)
        result = subprocess.check_output([str(executable), *arguments], text=True)
        (output / f"{name}.txt").write_text(result)
        print(name, result, sep="\n", flush=True)
