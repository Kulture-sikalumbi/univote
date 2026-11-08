$ErrorActionPreference='Stop'
$src=Join-Path (Get-Location) 'UniVote_Full_chapter_1_-_6_EDITED_V3_WITH_SCREENSHOTS.docx'
$dst=Join-Path (Get-Location) 'UniVote_Full_chapter_1_-_6_EDITED_V3_COMPLETE.docx'
$img=Join-Path (Get-Location) 'documentation/evidence/screenshots'
if(Test-Path -LiteralPath $dst){throw 'Complete document already exists; refusing to overwrite.'}
Copy-Item -LiteralPath $src -Destination $dst
$word=New-Object -ComObject Word.Application; $word.Visible=$false
$doc=$word.Documents.Open($dst,$false,$false)
function Find-Range([string]$text){$r=$doc.Content;if(-not $r.Find.Execute($text)){throw "Anchor not found: $text"};return $r}
function Insert-Block([string]$anchor,[string]$block,[array]$pics){
 $r=Find-Range $anchor;$pos=$r.Start;$at=$doc.Range($pos,$pos);$at.InsertBefore($block)
 foreach($pic in $pics){$slot=Find-Range $pic.Token;$start=$slot.Start;$slot.Text='';$pr=$doc.Range($start,$start);[void]$doc.InlineShapes.AddPicture($pic.Path,$false,$true,$pr);$after=$doc.Range($pr.End,$pr.End);$after.InsertParagraphAfter()}
}
$screens=@(
 @{Token='[UV_SCREEN_HOME]';Path=(Join-Path $img '01-platform-home.png')},
 @{Token='[UV_SCREEN_STUDENT]';Path=(Join-Path $img '02-student-sign-in.png')},
 @{Token='[UV_SCREEN_ADMIN]';Path=(Join-Path $img '03-school-admin-sign-in.png')}
)
$screenBlock="Figure 8: UniVote public platform home page`r[UV_SCREEN_HOME]`rFigure 9: Student sign-in screen`r[UV_SCREEN_STUDENT]`rFigure 10: School administrator sign-in screen`r[UV_SCREEN_ADMIN]`r"
Insert-Block 'The following captures show the public platform home page and student and school administrator sign-in screens. No account credentials were submitted.' $screenBlock $screens
$tests=@(
 @{Token='[UV_SCREEN_UNIT]';Path=(Join-Path $img '04-unit-test-output.png')},
 @{Token='[UV_SCREEN_INTEGRATION]';Path=(Join-Path $img '05-integration-test-output.png')}
)
$testBlock="Recorded test-run output`rUnit tests: 9 suites and 21 tests passed.`r[UV_SCREEN_UNIT]`rFigure 11: Unit test run`rIntegration tests: 3 suites and 5 tests passed.`r[UV_SCREEN_INTEGRATION]`rFigure 12: Integration test run`r"
Insert-Block 'The unit suite ran 9 test suites with 21 tests passing.' $testBlock $tests
$doc.Repaginate();foreach($toc in $doc.TablesOfContents){$toc.Update()};[void]$doc.Fields.Update();$doc.Save();$doc.Close($true)
try{$word.Quit()}catch{}
[Runtime.InteropServices.Marshal]::ReleaseComObject($doc)|Out-Null;[Runtime.InteropServices.Marshal]::ReleaseComObject($word)|Out-Null
[GC]::Collect();[GC]::WaitForPendingFinalizers()
Write-Output "Created $dst with five evidence images in the Chapter Five body."
