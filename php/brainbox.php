<?php
error_reporting(E_ALL);
ini_set('display_errors', 'On');

include $_SERVER['DOCUMENT_ROOT']."/php/base.php";
$connection=mysqli_connect($dbhost,$dbuser,$dbpass,$dblogin) or die("ERROR: Can't connect to MySQL DB: " . mysql_error());

// http://files.figshare.com/1756790/002_t1_mpr_sag_standard.nii.gz

if(isset($_GET["action"]))
{
	switch($_GET["action"])
	{
		case "download":
			download($_GET);
			break;
		case "getLabelsets":
			getLabelsets($_GET);
			break;
	}
}

if(isset($_POST["action"]))
{
	switch($_POST["action"])
	{
		case "upload":
			upload();
			break;
	}
}
function brainbox($args)
{
	if($args[1]=="labels")
	{
		header('HTTP/1.1 200 OK');
		header("Status: 200 OK");
		print "foreground";
	}
	else
	if($args[1]=="users")
	{
		header('HTTP/1.1 200 OK');
		header("Status: 200 OK");
		print "roberto";
	}
}
function upload()
{
	// check user/password
    global $connection;
    global $dblogin;
    global $brainboxURL;
    $username = mysqli_real_escape_string($connection,$_POST['user']);
    $password = md5(mysqli_real_escape_string($connection,$_POST['password']));
    $query="SELECT * FROM ".$dblogin.".Users WHERE Username = '".$username."' AND Password = '".$password."'";
    $checklogin = mysqli_query($connection,$query);
    if(mysqli_num_rows($checklogin) == 0)
    {
		echo "ERROR: Wrong user/password\n";
		return;
	}
	
	// check that there is a file
	if(!isset($_FILES["atlas"]["name"]) || empty($_FILES["atlas"]["name"]))
	{
		echo "ERROR: No atlas file\n";
		return;
	}

	// check that the file was uploaded correctly
	if($_FILES["atlas"]["error"])
	{
		echo "ERROR: ".$_FILES["atlas"]["error"]."\n";
		return;
		// echo ini_get('upload_max_filesize');
	}

	// check that there is a url
	if(!isset($_POST["url"]))
	{
		echo "ERROR: No url\n";
		return;
	}

	// check that the url corresponds to a local directory
	$url=$_POST["url"];
	$hash=hash("md5",$url);
	$dir=$_SERVER['DOCUMENT_ROOT']."/data/".$hash;
	if(!file_exists($dir)) {
		echo "ERROR: No data for url\n";
		return;
	}

	// get mri info.json metadata file
	$txt=file_get_contents($dir."/info.json");
	$info=json_decode($txt);

	// check if atlas file already exists in info.json metadata file
	foreach($info->mri->atlas as $i)
		if($i->filename==$_FILES["atlas"]["name"])
		{
			echo "ERROR: Atlas file already exists [1]\n";
			return;
		}
	
	// check if atlas file already exists in data directory
	$file1=$dir."/".basename($_FILES["atlas"]["name"]);
	if(file_exists($file1)) {
		echo "ERROR: Atlas file already exists [2]\n";
		return;
	}
			
	// copy file
	move_uploaded_file($_FILES["atlas"]["tmp_name"],$file1);

	// get the dimensions of the atlas
	$tmp=@exec("../bin/volume -i ".$file1." -info|".
		'awk \'/dim:/{printf"{\"dim\":[%i,%i,%i],",$2,$3,$4}/voxelSize:/{printf"\"pixdim\":[%f,%f,%f]}",$2,$3,$4}\''
		,$arr,$retval);
	$info1=json_decode($tmp);
	if($info1->dim[0]*$info1->dim[1]*$info1->dim[2]==0)
	{
		echo "ERROR: Wrong atlas file\n";
		unlink($file1);
		return;
	}
	
	// check that mri and atlas dimensions correspond
	if($info->dim[0]!=$info1->dim[0]||$info->dim[1]!=$info1->dim[1]||$info->dim[2]!=$info1->dim[2])
	{
		echo "ERROR: Atlas dimensions do not match mri\n";
		unlink($file1);
		return;
	}

	// get creation date
	date_default_timezone_set("Europe/Paris");
	$dt = new DateTime();

	// append to atlas list
	if(isset($_POST["labels"]))
		$labels=$_POST["labels"];
	else
		$labels="foreground.json";
	$atlas=array(
		"owner"=>"/users/".$_POST["user"],
		"created"=>$dt->format(\DateTime::ISO8601),
		"modified"=>$dt->format(\DateTime::ISO8601),
		"access"=>"Read/Write",
		"type"=>"volume",
		"filename"=>$_FILES["atlas"]["name"],
		"labels"=>$brainboxURL."/labels/".$labels
	);
	$info->mri->atlas[]=$atlas;

	// save updated info.json metadata file
	$fp = fopen($dir."/info.json", 'w');
	fwrite($fp, json_encode($info));
	fclose($fp);

	echo "Success";			
}

function download($params)
{
	$url=$params["url"];
	//$hash=$params["hash"];
	$hash=hash("md5",$url);
	
	// download file from origin url
	$tokens = explode('/', $url);
	$filename=$tokens[sizeof($tokens)-1];

	header('Content-Type: application/json');

	$handle=fopen($url,'r');
	if($handle)
	{
		$dir=$_SERVER['DOCUMENT_ROOT']."/data/".$hash;

		if (!file_exists($dir)) {
			mkdir($dir,0777);
			chmod($dir,0777);
		}
		
		// Get data file and metadata
		//----------------------------
		// if file does not exist, download it and create info.json file
		if (!file_exists($dir."/".$filename)) {
			// download file
			$result=@file_put_contents($dir."/".$filename,$handle);
			chmod($dir."/".$filename, 0777);
			if($result)
			{
				// Create info.json file for new dataset
				
				// 1. get creation date
				date_default_timezone_set("Europe/Paris");
				$dt = new DateTime();

				// 2. get volume dimensions
				$tmp=@exec("../bin/volume -i ".$dir."/".$filename." -info|".
					'awk \'/dim:/{printf"{\"dim\":[%i,%i,%i],",$2,$3,$4}/voxelSize:/{printf"\"pixdim\":[%f,%f,%f]}",$2,$3,$4}\''
					,$arr,$retval);
				$info=json_decode($tmp);
				$info->localpath=$dir.'/'.$filename;
				$info->filename=$filename;
				$info->success=true;

				$info->source=$url;
				$info->included=$dt->format(\DateTime::ISO8601);
				$info->url="/data/".$hash."/";
				$info->mri=array(
					"brain"=>$filename,
					"atlas"=>array(
						array(
							"owner"=>"/users/THE_USER_URL",
							"created"=>$dt->format(\DateTime::ISO8601),
							"modified"=>$dt->format(\DateTime::ISO8601),
							"access"=>"Read/Write",
							"type"=>"volume",
							"filename"=>"Atlas.nii.gz",
							"labels"=>$brainboxURL."/labels/foreground.json"
						)
					)
				);
				
				$fp = fopen($dir."/info.json", 'w');
				fwrite($fp, json_encode($info));
				fclose($fp);				
				echo json_encode($info);
			}
			else
				echo '{"success":false,"message":"CANNOT DOWNLOAD FILE FROM SOURCE","result":"'.$result.'"}';

		}
		// if file exists, load info.json file
		else {
			$info=file_get_contents($dir."/info.json");
			echo $info;
		}
	}
	else
		echo '{"success":false,"message":"CANNOT OPEN FILE AT SOURCE","result":"'.$handle.'"}';
}

function getLabelsets()
{
	$arr=[];
	foreach (glob($_SERVER['DOCUMENT_ROOT']."/labels/*.json") as $path) {
		$info=json_decode(file_get_contents($path));
		$obj=array(
			"name"=>$info->name,
			"source"=>"http://brainbox.dev/labels/".basename($path)
		);	
		$arr[]=$obj;
	}
	echo json_encode($arr);
}
?>
