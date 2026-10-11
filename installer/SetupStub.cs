using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;

internal static class SetupStub
{
    [STAThread]
    private static int Main()
    {
        string temporaryRoot = Path.Combine(Path.GetTempPath(), "VesperSetup-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(temporaryRoot);
            using (Stream payload = Assembly.GetExecutingAssembly().GetManifestResourceStream("VesperInstallerPayload"))
            {
                if (payload == null) throw new InvalidOperationException("The Vesper setup files are missing.");
                using (ZipArchive archive = new ZipArchive(payload, ZipArchiveMode.Read))
                {
                    string safeRoot = Path.GetFullPath(temporaryRoot) + Path.DirectorySeparatorChar;
                    foreach (ZipArchiveEntry entry in archive.Entries)
                    {
                        string destination = Path.GetFullPath(Path.Combine(temporaryRoot, entry.FullName.Replace('/', Path.DirectorySeparatorChar)));
                        if (!destination.StartsWith(safeRoot, StringComparison.OrdinalIgnoreCase))
                            throw new InvalidDataException("The setup package contains an invalid file path.");
                        if (entry.FullName.EndsWith("/", StringComparison.Ordinal))
                        {
                            Directory.CreateDirectory(destination);
                            continue;
                        }
                        Directory.CreateDirectory(Path.GetDirectoryName(destination));
                        using (Stream input = entry.Open())
                        using (FileStream output = File.Create(destination)) input.CopyTo(output);
                    }
                }
            }

            string installerScript = Path.Combine(temporaryRoot, "Install-Vesper.ps1");
            ProcessStartInfo start = new ProcessStartInfo
            {
                FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"WindowsPowerShell\v1.0\powershell.exe"),
                Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + installerScript + "\"",
                WorkingDirectory = temporaryRoot,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            using (Process process = Process.Start(start))
            {
                if (process == null) throw new InvalidOperationException("Windows PowerShell could not start Vesper setup.");
                process.WaitForExit();
                return process.ExitCode;
            }
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message, "Vesper Setup", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
        finally
        {
            try { if (Directory.Exists(temporaryRoot)) Directory.Delete(temporaryRoot, true); }
            catch { }
        }
    }
}
