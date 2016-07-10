<?php
error_reporting(E_ALL);
ini_set('display_errors', 'On');

include $_SERVER['DOCUMENT_ROOT']."/php/base.php";

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
							"access"=>"Read/Write",
							"type"=>"volume",
							"filename"=>"Atlas.nii.gz",
							"labels"=>"http://brainbox.dev/labels/foreground.json"
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
