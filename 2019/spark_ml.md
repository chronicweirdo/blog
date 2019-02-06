- simplify the program even more
- make the whole segment a vector
- run a clustering on those vectors (no label)

``` scala
package com.bosch.conan.spark.apps

import java.sql.Timestamp

import org.apache.spark.ml.classification.LogisticRegression
import org.apache.spark.ml.clustering.KMeans
import org.apache.spark.ml.evaluation.ClusteringEvaluator
import org.apache.spark.ml.linalg.{Vector, Vectors}
import org.apache.spark.sql._
import org.apache.spark.sql.functions._
import org.apache.spark.sql.types._

import scala.util.Random

object MLTest3 {

  private val WINDOW = 5 * 60 * 1000

  private def getOrElse(name: String, default: String)(implicit argmap: Map[String, String], detailedLogs: Boolean = true)= {
    val result = argmap.getOrElse(name, default)
    if (detailedLogs) println(s"$name: $result")
    result
  }

  def getLabel() = if (Random.nextBoolean()) 1.0 else 0.0

  def main(args: Array[String]): Unit = {
    implicit val argmap: Map[String, String] = args
      .map(a => a.split("="))
      .filter(a => a(0).nonEmpty && a(1).nonEmpty)
      .map(a => a(0) -> a(1))
      .toMap

    val applicationName = this.getClass.getCanonicalName
    val runLocal = getOrElse("local", "false").toBoolean
    val hdfsHost = getOrElse("hdfs_host", "127.0.0.1")
    val hdfsPort = getOrElse("hdfs_port", "9000")
    val hdfsSource = getOrElse("hdfs_source", "/pjcon/analysisParquet")

    implicit val spark: SparkSession = (if (runLocal) SparkSession.builder.master("local[*]") else SparkSession.builder())
        .appName(applicationName)
        .getOrCreate()

    import spark.implicits._

    spark.sparkContext.setLogLevel("WARN")
    spark.conf.set("spark.sql.session.timeZone", "UTC")

    val segments = spark.read
      .format("parquet")
      .option("maxFilesPerTrigger", 1)
      .option("mergeSchema", true)
      .load(s"hdfs://$hdfsHost:$hdfsPort$hdfsSource")

    val gps = segments.select(
      col("MEASUREMENT_UUID").as("id"),
      col("Sample_Time").as("time"),
      array(
        col("GPS_Latitude").cast(FloatType),
        col("GPS_Longitude").cast(FloatType)
      ).as("gps")
    )

    val getTimeSection = functions.udf((time: Timestamp) => new Timestamp((time.getTime / WINDOW) * WINDOW))

    val measurements = gps.withColumn("timeSection", getTimeSection(col("time")))
    //measurements.show(200)

    val sections = measurements.groupBy("id", "timeSection")
      .agg(collect_list("gps").as("gps"))
    sections.show(10)

    val createTile = functions.udf((gps: Seq[Seq[java.lang.Float]]) => {
      val size1 = 10
      val size2 = 10

      def getIndex(c1: Int, c2: Int) = c1 * size2 + c2
      val tile: Array[Double] = Array.fill((size1) * size2){0.0}

      val valid = gps.map(e => (e(0), e(1)))
        .filter(e => e._1 != null && e._2 != null)

      if (valid.nonEmpty) {
        val min1 = valid.map(_._1).min
        val max1 = valid.map(_._1).max
        val span1 = max1 - min1
        val min2 = valid.map(_._2).min
        val max2 = valid.map(_._2).max
        val span2 = max2 - min2

        val normalized = valid.map(e => ((e._1 - min1) / span1, (e._2 - min2) / span2))


        val quantized = normalized.map(e => ((e._1 * (size1-1)).toInt, (e._2 * (size2-1)).toInt))

        quantized.foreach(e => tile(getIndex(e._1, e._2)) = tile(getIndex(e._1, e._2)) + 1)
      }

      tile
    })
    val tileSizeComputation = functions.udf((tile: Seq[Double]) => tile.length)

    val tiles = sections.withColumn("tile", createTile(col("gps")))
        .withColumn("tileSize", tileSizeComputation(col("tile")))
    tiles.show(10)

    val dataset = tiles
      .map(s => (
        s.getString(s.fieldIndex("id")) + " " + s.getAs[Timestamp]("timeSection").getTime.toString,
        Vectors.dense(s.getAs[Seq[Double]]("tile").toArray))
      )
      .toDF("label", "features")

    val kmeans = new KMeans().setK(3).setSeed(1L)
    val model = kmeans.fit(dataset)
    val predictions: DataFrame = model.transform(dataset)
    val evaluator = new ClusteringEvaluator()
    predictions.show(10)
    predictions
      .map(p => p.getAs[String]("label") + "," + p.getAs[Int]("prediction").toString)
      .write.csv("clustering-result")

    val silhouette = evaluator.evaluate(predictions)
    println(s"Silhouette with squared euclidean distance = $silhouette")

    println("Cluster Centers: ")
    model.clusterCenters.foreach(println)
  }
}
```

Outputs:

```
+--------------------+-------------------+--------------------+
|                  id|        timeSection|                 gps|
+--------------------+-------------------+--------------------+
|06574ae1-254f-4c9...|2018-12-17 14:55:00|[[,], [,], [,], [...|
|2b512e7e-d39d-4b5...|2018-12-17 02:05:00|[[35.320717, 139....|
|3a92c5d0-3d96-49c...|2018-09-19 10:55:00|[[,], [,], [,], [...|
|3e8064a1-aaa1-433...|2018-10-26 11:40:00|[[,], [,], [,], [...|
|3e8064a1-aaa1-433...|2018-10-26 12:05:00|[[,], [,], [,], [...|
|8b5dc673-9908-457...|2018-09-21 13:15:00|[[48.915607, 9.16...|
|8f78e56a-67a5-42f...|2018-09-28 12:15:00|[[,], [,], [,], [...|
|ca532741-e90f-490...|2018-11-10 13:40:00|[[,], [,], [,], [...|
|ec59addb-c1cb-49d...|2018-12-17 08:00:00|[[35.39095, 139.3...|
|3db825b2-1b62-4a0...|2018-12-18 10:30:00|[[35.333862, 139....|
+--------------------+-------------------+--------------------+
only showing top 10 rows

+--------------------+-------------------+--------------------+--------------------+--------+
|                  id|        timeSection|                 gps|                tile|tileSize|
+--------------------+-------------------+--------------------+--------------------+--------+
|06574ae1-254f-4c9...|2018-12-17 14:55:00|[[,], [,], [,], [...|[7.0, 15.0, 3.0, ...|     100|
|2b512e7e-d39d-4b5...|2018-12-17 02:05:00|[[35.320717, 139....|[0.0, 0.0, 0.0, 0...|     100|
|3a92c5d0-3d96-49c...|2018-09-19 10:55:00|[[,], [,], [,], [...|[0.0, 0.0, 0.0, 0...|     100|
|3e8064a1-aaa1-433...|2018-10-26 11:40:00|[[,], [,], [,], [...|[0.0, 0.0, 0.0, 0...|     100|
|3e8064a1-aaa1-433...|2018-10-26 12:05:00|[[,], [,], [,], [...|[0.0, 0.0, 0.0, 0...|     100|
|8b5dc673-9908-457...|2018-09-21 13:15:00|[[48.915607, 9.16...|[300.0, 0.0, 0.0,...|     100|
|8f78e56a-67a5-42f...|2018-09-28 12:15:00|[[,], [,], [,], [...|[0.0, 0.0, 0.0, 0...|     100|
|ca532741-e90f-490...|2018-11-10 13:40:00|[[,], [,], [,], [...|[0.0, 0.0, 0.0, 0...|     100|
|ec59addb-c1cb-49d...|2018-12-17 08:00:00|[[35.39095, 139.3...|[0.0, 0.0, 0.0, 0...|     100|
|3db825b2-1b62-4a0...|2018-12-18 10:30:00|[[35.333862, 139....|[0.0, 0.0, 0.0, 0...|     100|
+--------------------+-------------------+--------------------+--------------------+--------+
only showing top 10 rows

19/02/05 13:47:27 WARN BLAS: Failed to load implementation from: com.github.fommil.netlib.NativeSystemBLAS
+--------------------+--------------------+----------+
|               label|            features|prediction|
+--------------------+--------------------+----------+
|06574ae1-254f-4c9...|[7.0,15.0,3.0,0.0...|         0|
|2b512e7e-d39d-4b5...|[0.0,0.0,0.0,0.0,...|         0|
|3a92c5d0-3d96-49c...|[0.0,0.0,0.0,0.0,...|         0|
|3e8064a1-aaa1-433...|[0.0,0.0,0.0,0.0,...|         0|
|3e8064a1-aaa1-433...|[0.0,0.0,0.0,0.0,...|         0|
|8b5dc673-9908-457...|[300.0,0.0,0.0,0....|         1|
|8f78e56a-67a5-42f...|[0.0,0.0,0.0,0.0,...|         0|
|ca532741-e90f-490...|[0.0,0.0,0.0,0.0,...|         0|
|ec59addb-c1cb-49d...|[0.0,0.0,0.0,0.0,...|         0|
|3db825b2-1b62-4a0...|[0.0,0.0,0.0,0.0,...|         0|
+--------------------+--------------------+----------+
only showing top 10 rows

Silhouette with squared euclidean distance = 0.8856604885217093
Cluster Centers: 
[4.007775119617225,1.638456937799043,1.0780502392344498,1.1211124401913874,1.0023923444976077,0.9638157894736842,1.075956937799043,1.5864234449760766,3.8708133971291865,0.7069377990430622,1.7227870813397128,1.5708732057416268,1.3717105263157894,1.145633971291866,1.083133971291866,0.9252392344497608,1.187200956937799,1.3941387559808611,1.4040071770334928,0.21740430622009568,1.1767344497607655,1.1435406698564592,1.367523923444976,1.3092105263157894,1.2024521531100478,1.3002392344497606,1.319976076555024,1.1010765550239234,0.9087918660287081,0.15520334928229665,0.9703947368421052,0.9748803827751196,1.3570574162679425,1.7338516746411483,1.6276913875598085,1.4910287081339713,1.2861842105263157,1.0840311004784688,0.8017344497607655,0.18421052631578946,0.9668062200956937,0.9375,1.0442583732057416,1.4973086124401913,1.7051435406698563,1.4040071770334928,1.2452153110047846,0.944677033492823,0.8504784688995215,0.13486842105263158,0.9449760765550239,0.8788875598086124,1.1330741626794258,1.4539473684210527,1.388157894736842,1.3139952153110048,1.2682416267942582,0.8148923444976076,0.8412081339712918,0.1471291866028708,1.1635765550239234,1.0592105263157894,1.2048444976076556,1.242822966507177,1.263157894736842,1.1004784688995215,1.513456937799043,1.1294856459330143,1.083133971291866,0.15311004784688995,1.6142344497607655,1.26255980861244,1.1058612440191387,0.9686004784688995,0.9219497607655502,0.9019138755980861,1.2990430622009568,1.6235047846889952,1.7473086124401913,0.16507177033492823,4.43122009569378,1.4721889952153109,1.1480263157894737,1.0035885167464114,0.9949162679425837,0.9294258373205742,1.1653708133971292,1.6073564593301435,3.375897129186603,0.26555023923444976,0.479066985645933,0.11124401913875598,0.1465311004784689,0.11034688995215311,0.1339712918660287,0.10077751196172248,0.1396531100478469,0.10167464114832535,0.2215909090909091,0.33133971291866027]
[292.7407407407407,0.28703703703703703,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.537037037037037,0.2006172839506173,0.05864197530864197,0.009259259259259259,0.0,0.0,0.0,0.0,0.0,0.0,0.05246913580246913,0.1111111111111111,0.07407407407407407,0.05555555555555555,0.021604938271604937,0.015432098765432098,0.0030864197530864196,0.0,0.0,0.024691358024691357,0.040123456790123455,0.040123456790123455,0.05246913580246913,0.06481481481481481,0.030864197530864196,0.018518518518518517,0.018518518518518517,0.024691358024691357,0.009259259259259259,0.0,0.027777777777777776,0.027777777777777776,0.018518518518518517,0.04938271604938271,0.08641975308641975,0.06790123456790123,0.024691358024691357,0.0,0.024691358024691357,0.015432098765432098,0.037037037037037035,0.030864197530864196,0.0,0.015432098765432098,0.021604938271604937,0.08641975308641975,0.037037037037037035,0.030864197530864196,0.018518518518518517,0.012345679012345678,0.08641975308641975,0.05555555555555555,0.021604938271604937,0.018518518518518517,0.033950617283950615,0.05246913580246913,0.05864197530864197,0.05246913580246913,0.046296296296296294,0.12962962962962962,0.0,0.030864197530864196,0.05555555555555555,0.0,0.0,0.012345679012345678,0.08024691358024691,0.10493827160493827,0.11419753086419752,0.006172839506172839,0.018518518518518517,0.012345679012345678,0.14814814814814814,0.08333333333333333,0.06481481481481481,0.26543209876543206,0.046296296296296294,0.2962962962962963,1.3580246913580245,0.08024691358024691,0.0030864197530864196,0.0,0.0,0.0,0.0,0.009259259259259259,0.0030864197530864196,0.0,0.20987654320987653,0.43827160493827155]
[22.5625,3.34375,3.1875,1.71875,1.1875,0.6875,0.0625,0.0,0.0,0.0,5.625,3.125,1.40625,0.59375,0.34375,0.03125,0.0,0.0,0.0,0.0,3.5,3.28125,3.15625,0.75,0.34375,0.65625,0.28125,0.03125,0.0,0.0,3.0625,1.125,2.0,3.875,0.75,0.3125,0.875,0.34375,0.0,0.0,2.25,0.59375,1.03125,3.6875,1.5,1.25,0.78125,0.8125,0.1875,0.0,0.15625,1.71875,1.5,2.375,2.8125,2.15625,1.125,1.03125,0.25,0.03125,0.0,0.0,0.0,1.125,2.46875,2.9375,2.5625,1.46875,2.1875,0.1875,0.0,0.0,0.0,0.03125,1.0625,3.46875,3.5,3.90625,8.1875,0.40625,0.1875,0.25,2.25,0.125,0.5,0.875,1.875,5.625,207.375,5.84375,0.03125,0.0,0.0,0.0,0.0,0.0,0.0625,0.03125,3.3125,0.125]
```

Writing array to file as an image:

``` scala
object ImageTest extends App {

  val scale = 1
  val size1 = 10
  val size2 = 10
  val data = Seq(
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 1, 1, 0, 0, 1, 1, 0, 0,
    0, 0, 1, 1, 0, 0, 1, 1, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 1, 0, 0, 0, 0, 0, 0, 1, 0,
    0, 0, 1, 0, 0, 0, 0, 1, 0, 0,
    0, 0, 0, 1, 1, 1, 1, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0
  )

  var img = new BufferedImage(size1, size2, BufferedImage.TYPE_INT_ARGB)

  def getPixel(a: Int, r: Int, g: Int, b: Int) = {
    (a << 24) | (r << 16) | (g << 8) | b
  }

  for (i <- 0 to data.length-1) {
    val x = i % size1;
    val y = i / size1;
    val p = if (data(i) == 0) getPixel(255, 255, 255, 255) else getPixel(255, 0, 0, 0)
    println(p)
    img.setRGB(x, y, p)
  }

  val f = new File("Output.jpg")
  ImageIO.write(img, "png", f)
}
```

Writing array to file as a scaled image:

``` scala
object ImageTest extends App {

  val scale = 100
  val size1 = 10
  val size2 = 10
  val data = Seq(
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 1, 1, 0, 0, 1, 1, 0, 0,
    0, 0, 1, 1, 0, 0, 1, 1, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 1, 0, 0, 0, 0, 0, 0, 1, 0,
    0, 0, 1, 0, 0, 0, 0, 1, 0, 0,
    0, 0, 0, 1, 1, 1, 1, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0
  )

  val width = size1 * scale
  val height = size2 * scale
  var img = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB)

  def getPixel(a: Int, r: Int, g: Int, b: Int) = {
    (a << 24) | (r << 16) | (g << 8) | b
  }

  def getIndex(x: Int, y: Int) = (y / scale) * size1 + (x / scale)

  for (y <- 0 until height) {
    for (x <- 0 until width) {
      val p = if (data(getIndex(x, y)) == 0) getPixel(255, 255, 255, 255) else getPixel(255, 0, 0, 0)
      img.setRGB(x, y, p)
    }
  }

  val f = new File("Output.jpg")
  ImageIO.write(img, "png", f)
}
```

And then an update, to also print out the image tiles, each in a folder for its own cluster:

``` scala
package com.bosch.conan.spark.apps

import java.awt.image.BufferedImage
import java.io.File
import java.sql.Timestamp

import com.bosch.conan.spark.apps.ArrayToImageWriter.getIndex
import javax.imageio.ImageIO
import org.apache.spark.ml.classification.LogisticRegression
import org.apache.spark.ml.clustering.KMeans
import org.apache.spark.ml.evaluation.ClusteringEvaluator
import org.apache.spark.ml.linalg.{Vector, Vectors}
import org.apache.spark.sql._
import org.apache.spark.sql.functions._
import org.apache.spark.sql.types._

import scala.util.Random

object MLTest3 {

  private val WINDOW = 5 * 60 * 1000

  private def getOrElse(name: String, default: String)(implicit argmap: Map[String, String], detailedLogs: Boolean = true)= {
    val result = argmap.getOrElse(name, default)
    if (detailedLogs) println(s"$name: $result")
    result
  }

  def getLabel() = if (Random.nextBoolean()) 1.0 else 0.0

  def main(args: Array[String]): Unit = {
    implicit val argmap: Map[String, String] = args
      .map(a => a.split("="))
      .filter(a => a(0).nonEmpty && a(1).nonEmpty)
      .map(a => a(0) -> a(1))
      .toMap

    val applicationName = this.getClass.getCanonicalName
    val runLocal = getOrElse("local", "false").toBoolean
    val hdfsHost = getOrElse("hdfs_host", "127.0.0.1")
    val hdfsPort = getOrElse("hdfs_port", "9000")
    val hdfsSource = getOrElse("hdfs_source", "/pjcon/analysisParquet")

    implicit val spark: SparkSession = (if (runLocal) SparkSession.builder.master("local[*]") else SparkSession.builder())
        .appName(applicationName)
        .getOrCreate()

    import spark.implicits._

    spark.sparkContext.setLogLevel("WARN")
    spark.conf.set("spark.sql.session.timeZone", "UTC")

    val segments = spark.read
      .format("parquet")
      .option("maxFilesPerTrigger", 1)
      .option("mergeSchema", true)
      .load(s"hdfs://$hdfsHost:$hdfsPort$hdfsSource")

    val gps = segments.select(
      col("MEASUREMENT_UUID").as("id"),
      col("Sample_Time").as("time"),
      array(
        col("GPS_Latitude").cast(FloatType),
        col("GPS_Longitude").cast(FloatType)
      ).as("gps")
    )

    val getTimeSection = functions.udf((time: Timestamp) => new Timestamp((time.getTime / WINDOW) * WINDOW))

    val measurements = gps.withColumn("timeSection", getTimeSection(col("time")))
    //measurements.show(200)

    val tileSize1 = 10
    val tileSize2 = 10

    val sections = measurements.groupBy("id", "timeSection")
      .agg(collect_list("gps").as("gps"))
    sections.show(10)

    val createTile = functions.udf((gps: Seq[Seq[java.lang.Float]]) => {
      def getIndex(c1: Int, c2: Int) = c1 * tileSize2 + c2
      val tile: Array[Double] = Array.fill(tileSize1 * tileSize2){0.0}

      val valid = gps.map(e => (e(0), e(1)))
        .filter(e => e._1 != null && e._2 != null)

      if (valid.nonEmpty) {
        val min1 = valid.map(_._1).min
        val max1 = valid.map(_._1).max
        val span1 = max1 - min1
        val min2 = valid.map(_._2).min
        val max2 = valid.map(_._2).max
        val span2 = max2 - min2

        val normalized = valid.map(e => ((e._1 - min1) / span1, (e._2 - min2) / span2))


        val quantized = normalized.map(e => ((e._1 * (tileSize1-1)).toInt, (e._2 * (tileSize2-1)).toInt))

        quantized.foreach(e => tile(getIndex(e._1, e._2)) = tile(getIndex(e._1, e._2)) + 1)
      }

      tile
    })
    val tileSizeComputation = functions.udf((tile: Seq[Double]) => tile.length)

    val tiles = sections.withColumn("tile", createTile(col("gps")))
        .withColumn("tileSize", tileSizeComputation(col("tile")))
    tiles.show(10)

    val dataset = tiles
      .map(s => (
        s.getString(s.fieldIndex("id")) + " " + s.getAs[Timestamp]("timeSection").getTime.toString,
        Vectors.dense(s.getAs[Seq[Double]]("tile").toArray))
      )
      .toDF("label", "features")

    val resultFolderPath = "clustering-result-" + System.currentTimeMillis()

    val kmeans = new KMeans().setK(5).setSeed(1L)
    val model = kmeans.fit(dataset)
    val predictions: DataFrame = model.transform(dataset)
    val evaluator = new ClusteringEvaluator()
    predictions.show(10)
    predictions
      .map(p => p.getAs[String]("label") + "," + p.getAs[Int]("prediction").toString)
      .write.csv(resultFolderPath)

    def createFolder(path: String) = new File(path).mkdir()

    val predictionGroups = predictions
      .groupBy("prediction")
      .agg(collect_list(
        struct(col("label"), col("features"))
      ).as("tiles"))
    predictionGroups.show(10)

    predictionGroups.foreach(cluster => {
        val clusterPath = resultFolderPath + "\\" + cluster.getAs[String]("prediction")
        createFolder(clusterPath)

        val tiles = cluster.getSeq[Row](cluster.fieldIndex("tiles"))
        tiles.foreach(tile =>
          ArrayToImageWriter.writeArray(tile.getAs[Vector](1).toArray, tileSize1, tileSize2, clusterPath + "\\" + tile.getString(0) + ".jpg")
        )
      })

    val silhouette = evaluator.evaluate(predictions)
    println(s"Silhouette with squared euclidean distance = $silhouette")

    println("Cluster Centers: ")
    model.clusterCenters.foreach(println)
  }
}

object ArrayToImageWriter {

  def writeArray(data: Array[Double], size1: Int, size2: Int, path: String) = {
    write(
      data.map(d => d.toInt),
      size1,
      size2,
      path
    )
  }

  def write(data: Seq[Int], size1: Int, size2: Int, path: String) = {
    val scale = 10

    val width = size1 * scale
    val height = size2 * scale
    val img = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB)

    val black = getPixel(255, 0, 0, 0)
    val white = getPixel(255, 255, 255, 255)

    for (y <- 0 until height) {
      for (x <- 0 until width) {
        val p = if (data(getIndex(x, y, scale, size1)) == 0) white else black
        img.setRGB(x, y, p)
      }
    }

    val f = new File(path)
    ImageIO.write(img, "png", f)
  }

  def getIndex(x: Int, y: Int, scale: Int, size1: Int) = (y / scale) * size1 + (x / scale)

  def getPixel(a: Int, r: Int, g: Int, b: Int) = {
    (a << 24) | (r << 16) | (g << 8) | b
  }

  def test()= {

    val size1 = 10
    val size2 = 10
    val data = Seq(
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 1, 1, 0, 0, 1, 1, 0, 0,
      0, 0, 1, 1, 0, 0, 1, 1, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 1, 0, 0, 0, 0, 0, 0, 1, 0,
      0, 0, 1, 0, 0, 0, 0, 1, 0, 0,
      0, 0, 0, 1, 1, 1, 1, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    )

    write(data, size1, size2, "output.jpg")
  }

  def main(args: Array[String]): Unit = {
    test()
  }
}
```
